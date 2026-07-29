import { dashboardRepository } from "../repositories/dashboardRepository";
import { employeeRepository } from "../repositories/employeeRepository";
import { serviceRepository } from "../repositories/serviceRepository";
import {
  DashboardAlert,
  DashboardKpis,
  EmployeeRow,
  HeatmapCell,
  OccupancyBucket,
  ServiceRankRow,
  TeamRow,
  UpcomingRow,
  buildAlerts,
  buildEmployeeAlerts,
  buildHeatmap,
  buildKpis,
  buildUpcoming,
  bucketOccupancy,
  rankServices,
  rankTeam,
} from "./dashboardRules";

export interface DashboardOverview {
  range: { days: number; from: string; to: string };
  kpis: DashboardKpis;
  occupancyByBucket: OccupancyBucket[];
  heatmap: HeatmapCell[];
  team: TeamRow[];
  services: ServiceRankRow[];
  upcoming: UpcomingRow[];
  alerts: DashboardAlert[];
}

// Tipo próprio em vez de campos nulos no DashboardOverview: o colaborador não
// tem "equipe" recortada em zero, ele simplesmente não tem essa leitura.
export interface EmployeeOverview {
  range: { days: number; from: string; to: string };
  kpis: DashboardKpis;
  occupancyByBucket: OccupancyBucket[];
  heatmap: HeatmapCell[];
  services: ServiceRankRow[];
  upcoming: UpcomingRow[];
  alerts: DashboardAlert[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_LIMIT = 8;
// Margem no take: slots de hoje já passados são descartados depois da query,
// então buscar exatamente o limite deixaria a lista curta no fim do dia.
const UPCOMING_FETCH = UPCOMING_LIMIT * 4;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Mesma convenção de publicBookingService: a janela começa na meia-noite UTC
// do dia de hoje, que é como Availability.date está gravado. O ritmo compara
// dois períodos igualmente fechados no passado — comparar a agenda futura com
// o passado seria estruturalmente negativo.
function windowOf(days: number, now: Date) {
  const from = new Date(`${dayKey(now)}T00:00:00.000Z`);

  return {
    from,
    to: new Date(from.getTime() + days * DAY_MS),
    paceFrom: new Date(from.getTime() - days * DAY_MS),
    pacePreviousFrom: new Date(from.getTime() - 2 * days * DAY_MS),
  };
}

export const dashboardService = {
  async getOverview(
    businessId: number,
    days: number,
    now: Date,
  ): Promise<DashboardOverview> {
    const { from, to, paceFrom, pacePreviousFrom } = windowOf(days, now);

    const [slots, upcomingRows, paceCurrent, pacePrevious, employees, services] =
      await Promise.all([
        dashboardRepository.findSlotsInRange(businessId, from, to),
        dashboardRepository.findUpcomingBooked(businessId, from, UPCOMING_FETCH),
        dashboardRepository.countBookingsCreatedBetween(businessId, paceFrom, from),
        dashboardRepository.countBookingsCreatedBetween(
          businessId,
          pacePreviousFrom,
          paceFrom,
        ),
        employeeRepository.findManyByBusiness(businessId),
        serviceRepository.findManyByBusiness(businessId),
      ]);

    const employeeRows: EmployeeRow[] = employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      pendingInvite: employee.password === null,
      serviceIds: employee.services.map((link) => link.service.id),
    }));

    const catalog = services.map((service) => ({
      id: service.id,
      name: service.name,
    }));

    return {
      range: { days, from: dayKey(from), to: dayKey(to) },
      kpis: buildKpis(slots, { current: paceCurrent, previous: pacePrevious }),
      occupancyByBucket: bucketOccupancy(slots, days, from),
      heatmap: buildHeatmap(slots),
      team: rankTeam(slots, employeeRows),
      services: rankServices(slots),
      upcoming: buildUpcoming(upcomingRows, now, UPCOMING_LIMIT),
      alerts: buildAlerts(slots, employeeRows, catalog, days),
    };
  },

  async getEmployeeOverview(
    businessId: number,
    employeeId: number,
    days: number,
    now: Date,
  ): Promise<EmployeeOverview> {
    const { from, to, paceFrom, pacePreviousFrom } = windowOf(days, now);

    const [slots, upcomingRows, paceCurrent, pacePrevious] = await Promise.all([
      dashboardRepository.findSlotsInRange(businessId, from, to, employeeId),
      dashboardRepository.findUpcomingBooked(
        businessId,
        from,
        UPCOMING_FETCH,
        employeeId,
      ),
      dashboardRepository.countBookingsCreatedBetween(
        businessId,
        paceFrom,
        from,
        employeeId,
      ),
      dashboardRepository.countBookingsCreatedBetween(
        businessId,
        pacePreviousFrom,
        paceFrom,
        employeeId,
      ),
    ]);

    // As mesmas regras do painel do dono rodam aqui — a diferença toda está
    // no recorte dos slots, não no cálculo.
    return {
      range: { days, from: dayKey(from), to: dayKey(to) },
      kpis: buildKpis(slots, { current: paceCurrent, previous: pacePrevious }),
      occupancyByBucket: bucketOccupancy(slots, days, from),
      heatmap: buildHeatmap(slots),
      services: rankServices(slots),
      upcoming: buildUpcoming(upcomingRows, now, UPCOMING_LIMIT),
      alerts: buildEmployeeAlerts(slots, days),
    };
  },
};
