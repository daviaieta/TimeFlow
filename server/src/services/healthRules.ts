export interface HealthReport {
  status: "ok" | "degraded";
  database: "up" | "down";
}

// A API sem banco não serve para nada: responder 200 nesse estado faria o
// provedor manter no ar uma instância que erra toda requisição real.
export function buildHealthReport(databaseReachable: boolean): HealthReport {
  return databaseReachable
    ? { status: "ok", database: "up" }
    : { status: "degraded", database: "down" };
}
