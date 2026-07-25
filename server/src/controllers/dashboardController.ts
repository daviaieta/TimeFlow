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
