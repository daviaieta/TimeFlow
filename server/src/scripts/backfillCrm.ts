import "dotenv/config";
import { prisma } from "../lib/prisma";
import { BackfillReport, runCrmBackfill } from "../services/crmBackfillService";

// Backfill histórico do CRM (§8 fase 3 do documento de arquitetura).
//
// Uso, da pasta server/:
//   npm run backfill-crm                      simula tudo e não grava nada
//   npm run backfill-crm -- --business 3      simula só um negócio
//   npm run backfill-crm -- --apply           grava
//   railway run --service api npm run backfill-crm
//
// Simular é o default de propósito: é a única rotina do sistema que escreve em
// linha histórica. Gravar exige --apply, escrito à mão.
//
// Pode ser interrompido com Ctrl-C e rodado de novo: cada grupo é uma
// transação, e a segunda execução só olha reserva que ainda não tem prontuário.

// Só host e nome do banco, nunca usuário e senha: este texto vai para a tela e
// pode acabar colado num chat. Mesma razão do reset-password.
function describeDatabase(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "(DATABASE_URL ilegível)";
  }
}

function parseArgs(argv: string[]): { apply: boolean; businessId?: number } {
  const apply = argv.includes("--apply");
  const flagIndex = argv.indexOf("--business");
  if (flagIndex === -1) return { apply };

  const raw = argv[flagIndex + 1];
  const businessId = Number(raw);
  if (!Number.isInteger(businessId) || businessId <= 0) {
    console.error(`--business precisa de um id inteiro; recebi ${raw ?? "(nada)"}.`);
    process.exit(1);
  }

  return { apply, businessId };
}

function printReport(report: BackfillReport, apply: boolean): void {
  const verb = apply ? "gravadas" : "que seriam gravadas";

  console.log(`\nNegócios percorridos: ${report.businesses}`);

  console.log("\nReservas");
  console.log(`  candidatas (sem prontuário)      ${report.bookingsCandidate}`);
  console.log(`  já vinculadas antes (puladas)    ${report.bookingsAlreadyLinked}`);
  console.log(`  vinculadas ${verb.padEnd(22)}${report.bookingsLinked}`);
  console.log(`  sem resolver (sem canal)         ${report.bookingsUnresolved}`);

  console.log("\nGrupos e prontuários");
  console.log(`  grupos de contato                ${report.groups}`);
  console.log(`  prontuários criados              ${report.profilesCreated}`);
  console.log(`  prontuários reusados (rerun)     ${report.profilesReused}`);

  console.log("\nIdentidades (todas PROVISIONAL, nenhuma faz login)");
  console.log(`  criadas                          ${report.customersCreated}`);
  console.log(`  com e-mail reivindicado          ${report.customersClaimingEmail}`);
  console.log(`  com telefone reivindicado        ${report.customersClaimingPhone}`);
  console.log(`  sem canal (já era de outra)      ${report.customersWithoutChannel}`);

  console.log("\nGasto");
  console.log(`  prontuários com gasto exato      ${report.profilesExactSpend}`);
  console.log(`  prontuários com gasto estimado   ${report.profilesEstimatedSpend}`);

  const soma =
    report.bookingsLinked + report.bookingsUnresolved;
  if (soma !== report.bookingsCandidate) {
    console.log(
      `\nATENÇÃO: ${report.bookingsCandidate} candidatas, mas ${report.bookingsLinked} vinculadas` +
        ` + ${report.bookingsUnresolved} sem resolver = ${soma}. A diferença são reservas que` +
        ` ganharam prontuário entre o planejamento e a escrita (escrita ao vivo da fase 2` +
        ` acontecendo em paralelo). Rodar de novo fecha a conta.`,
    );
  }
}

async function main(): Promise<void> {
  const { apply, businessId } = parseArgs(process.argv.slice(2));

  console.log(`Banco:  ${describeDatabase(process.env.DATABASE_URL ?? "")}`);
  console.log(`Modo:   ${apply ? "GRAVANDO (--apply)" : "simulação — nada será gravado"}`);
  console.log(`Escopo: ${businessId ? `negócio ${businessId}` : "todos os negócios"}`);

  const startedAt = Date.now();
  const report = await runCrmBackfill({ apply, businessId });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  printReport(report, apply);
  console.log(`\nTempo: ${seconds}s`);

  if (!apply) {
    console.log("\nNada foi gravado. Para gravar: npm run backfill-crm -- --apply");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
