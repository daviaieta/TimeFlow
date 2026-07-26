import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHealthReport } from "./healthRules";

test("banco alcançável reporta serviço saudável", () => {
  assert.deepEqual(buildHealthReport(true), { status: "ok", database: "up" });
});

test("banco inalcançável degrada o serviço", () => {
  assert.deepEqual(buildHealthReport(false), {
    status: "degraded",
    database: "down",
  });
});
