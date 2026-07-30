-- Fase 0 do CRM (docs/2026-07-30-crm-architecture.md): a reserva passa a
-- carregar o próprio negócio, em vez de só alcançá-lo via Service.businessId.
-- Escrita à mão porque o passo gerado não faz o backfill — sem ele a coluna
-- nasceria nula nas reservas que já existem e nenhuma consulta poderia
-- confiar nela.
--
-- Nada lê a coluna nova ainda: as listagens continuam com o join por Service.
-- Esta migration é preparo de índice e de particionamento futuro.

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "businessId" INTEGER,
ADD COLUMN     "priceAtBooking" DECIMAL(10,2);

-- Backfill do tenant: o negócio da reserva é o negócio do serviço reservado.
-- É a mesma regra que o código já usava para autorizar, agora materializada.
UPDATE "Booking" b
SET "businessId" = s."businessId"
FROM "Service" s
WHERE s."id" = b."serviceId";

-- priceAtBooking NÃO é backfillado de propósito. Service.price é o preço de
-- hoje, não o do dia da reserva: preencher com ele produziria um histórico
-- financeiro falso e indistinguível do verdadeiro. Nulo significa "não sei",
-- e o CRM rotula o gasto dessas reservas como estimativa.

-- AddForeignKey
-- ON DELETE SET NULL é o que o Prisma gera para relação opcional. Mantido como
-- gerado para não criar drift entre o schema e o banco; apagar Business não é
-- operação suportada pelo produto (Service.businessId já é RESTRICT), então a
-- ação nunca é exercida na prática.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- Depois do backfill: criar antes faria o UPDATE manter o índice linha por
-- linha sem necessidade.
--
-- IF NOT EXISTS porque em volume de produção este índice precisa ser criado
-- CONCURRENTLY, fora desta migration — o Prisma envolve cada arquivo numa
-- transação e CREATE INDEX CONCURRENTLY não roda dentro de uma. O
-- procedimento lá é: criar o índice à mão com CONCURRENTLY antes do deploy,
-- e então este passo vira no-op em vez de travar a tabela mais escrita do
-- sistema.
CREATE INDEX IF NOT EXISTS "Booking_businessId_createdAt_idx" ON "Booking"("businessId", "createdAt" DESC);
