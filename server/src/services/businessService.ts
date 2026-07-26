import { Business } from "@prisma/client";
import { env } from "../config/env";
import { ConflictError } from "../lib/errors";
import { generateInviteToken } from "../lib/inviteToken";
import { sendInviteEmail } from "../lib/inviteEmail";
import { businessRepository } from "../repositories/businessRepository";
import { userRepository } from "../repositories/userRepository";
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
};
