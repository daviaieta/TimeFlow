import { FastifyReply, FastifyRequest } from "fastify";
import { requireBusinessId } from "../lib/requireBusinessId";
import { dashboardService } from "../services/dashboardService";

export interface OverviewQuery {
  days: number;
}

export async function getOverview(
  request: FastifyRequest<{ Querystring: OverviewQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const businessId = requireBusinessId(request);
  const overview = await dashboardService.getOverview(
    businessId,
    request.query.days,
    new Date(),
  );

  reply.send(overview);
}

// O recorte vem do token, nunca da requisição: não existe parâmetro por onde
// um colaborador peça o painel de outro.
export async function getMyOverview(
  request: FastifyRequest<{ Querystring: OverviewQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const businessId = requireBusinessId(request);
  const overview = await dashboardService.getEmployeeOverview(
    businessId,
    request.user.sub,
    request.query.days,
    new Date(),
  );

  reply.send(overview);
}
