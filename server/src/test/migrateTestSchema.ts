// Roda antes da suíte de integração (`pretest:integration`): aplica as
// migrations no schema de teste uma única vez, com um processo só. Sem isso,
// cada arquivo de teste tentaria migrar em paralelo e os processos brigariam
// pela criação do schema.
import { applyMigrations, testPrisma } from "./testDb";

async function main(): Promise<void> {
  await applyMigrations();
  await testPrisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
