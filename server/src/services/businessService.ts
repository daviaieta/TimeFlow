import { Business, Role } from "@prisma/client";
import { env } from "../config/env";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { generateInviteToken } from "../lib/inviteToken";
import { sendEmployeeInviteEmail, sendInviteEmail } from "../lib/inviteEmail";
import { businessRepository } from "../repositories/businessRepository";
import { userRepository } from "../repositories/userRepository";
import { canEditBusiness } from "./accountRules";
import {
  PlatformOverview,
  buildBusinessRows,
  buildPlatformTotals,
} from "./platformRules";

interface CreateBusinessInput {
  name: string;
  slug: string;
  admin: {
    name: string;
    email: string;
  };
}

interface CreateBusinessResult {
  business: Business;
  admin: {
    id: number;
    name: string;
    email: string;
  };
}

export const businessService = {
  async listBusinesses(): Promise<PlatformOverview> {
    const [businesses, roleCounts, pendingInvites] = await Promise.all([
      businessRepository.findAll(),
      userRepository.countByBusinessAndRole(),
      userRepository.findPendingInvites(),
    ]);

    const rows = buildBusinessRows(businesses, roleCounts, pendingInvites);

    return { totals: buildPlatformTotals(rows), businesses: rows };
  },

  async createBusiness(input: CreateBusinessInput): Promise<CreateBusinessResult> {
    const slugTaken = await businessRepository.findBySlug(input.slug);
    if (slugTaken) {
      throw new ConflictError("A business with this slug already exists");
    }

    const emailTaken = await userRepository.findByEmail(input.admin.email);
    if (emailTaken) {
      throw new ConflictError("A user with this email already exists");
    }

    const { token, expiresAt } = generateInviteToken();
    console.log(token);

    const { users, ...business } = await businessRepository.createWithAdmin({
      name: input.name,
      slug: input.slug,
      admin: {
        name: input.admin.name,
        email: input.admin.email,
        inviteToken: token,
        inviteTokenExpiresAt: expiresAt,
      },
    });

    const admin = users[0];
    const inviteLink = `${env.webOrigin}/accept-invite?token=${token}`;

    try {
      await sendInviteEmail({
        to: admin.email,
        adminName: admin.name,
        businessName: business.name,
        inviteLink,
      });
    } catch (error) {
      // O business já foi criado — falha no e-mail não deve desfazer o cadastro.
      // O link fica no console para reenvio manual enquanto não há fila/retry.
      console.error(`Failed to send invite email to ${admin.email}:`, error);
      console.log(`Invite link for ${admin.email}: ${inviteLink}`);
    }

    return {
      business,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
    };
  },

  async resendInvite(businessId: number, userId: number): Promise<void> {
    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const user = await userRepository.findById(userId);
    if (!user || user.businessId !== businessId) {
      throw new NotFoundError("User not found");
    }

    if (user.password !== null) {
      throw new ConflictError("This invite has already been accepted");
    }

    const { token, expiresAt } = generateInviteToken();
    const inviteLink = `${env.webOrigin}/accept-invite?token=${token}`;

    // Envia ANTES de gravar. Na ordem inversa, uma falha de envio deixaria o
    // token antigo já sobrescrito: o link que o convidado tem morre e nenhum
    // novo chega, e o convite fica irrecuperável sem mexer no banco. Aqui, a
    // falha de envio deixa o estado intacto. O caso oposto — envio ok, escrita
    // falha — entrega um link morto, mas basta reenviar de novo.
    try {
      if (user.role === Role.EMPLOYEE) {
        await sendEmployeeInviteEmail({
          to: user.email,
          employeeName: user.name,
          businessName: business.name,
          inviteLink,
        });
      } else {
        await sendInviteEmail({
          to: user.email,
          adminName: user.name,
          businessName: business.name,
          inviteLink,
        });
      }
    } catch (error) {
      // Diferente de createBusiness, que engole a falha porque o negócio já
      // existe: aqui não há nada criado para preservar, e responder 200 sem ter
      // enviado seria mentir para quem clicou.
      console.error(`Failed to resend invite email to ${user.email}:`, error);
      throw new AppError("Could not send the invite email", 502);
    }

    await userRepository.resetInviteToken(user.id, token, expiresAt);
  },

  async updateBusiness(
    businessId: number,
    userBusinessId: number | null,
    input: { name: string; slug: string; address: string | null },
  ) {
    // Antes de qualquer leitura do alvo: responder 404 para um id que existe
    // mas não é seu vazaria a existência de outros negócios.
    if (!canEditBusiness(businessId, userBusinessId)) {
      throw new ForbiddenError("You do not have permission to edit this business");
    }

    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const slugOwner = await businessRepository.findBySlug(input.slug);
    if (slugOwner && slugOwner.id !== businessId) {
      throw new ConflictError("A business with this slug already exists");
    }

    return businessRepository.update(businessId, input);
  },
};
