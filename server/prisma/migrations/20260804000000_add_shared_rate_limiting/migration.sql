-- Fase 5, passo 1 — limitação de abuso compartilhada (§11.6).
--
-- Pré-requisito declarado da fase 5: o limitador em memória é um Map por
-- processo, que zera no restart e não enxerga outra instância. Isso passa
-- enquanto o que ele protege é o formulário de contato; não passa quando o que
-- ele protege é autenticação de cliente exposta à internet, onde o ataque é
-- credential stuffing distribuído e flood de OTP.
--
-- Decisão registrada (2026-08-03): contadores no Postgres em vez de Redis. O
-- documento sanciona as duas ("ou contadores no Postgres se adicionar Redis
-- for inaceitável"); o banco já está no stack e o volume atual não paga um
-- serviço novo no Railway.
--
-- DDL puro: duas tabelas novas, nenhuma coluna existente tocada, nenhum
-- backfill. Rollback é DROP TABLE nas duas — nada depende delas até o passo 3
-- ligar o login de cliente.

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuthLockout" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthLockout_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
-- Só serve à varredura de linhas vencidas. IF NOT EXISTS para que, em volume,
-- o índice possa ser pré-criado CONCURRENTLY fora da migration (§12) — o
-- Prisma envolve cada arquivo numa transação, e CREATE INDEX CONCURRENTLY não
-- roda dentro de uma.
CREATE INDEX IF NOT EXISTS "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthLockout_expiresAt_idx" ON "AuthLockout"("expiresAt");
