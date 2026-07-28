import "dotenv/config";
import { createInterface } from "node:readline";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";

// Recuperação de acesso pela linha de comando. Existe porque não há fluxo de
// "esqueci minha senha" no produto: o link da tela de login é decorativo, e
// sem isto a única saída para um SUPERADMIN sem senha seria um UPDATE à mão
// no banco.
//
// Uso, da pasta server/:
//   npm run reset-password -- alguem@exemplo.com          (banco do .env local)
//   railway run --service api npm run reset-password -- alguem@exemplo.com
//
// A senha é digitada, nunca passada por argumento: argumento fica no
// histórico do shell e aparece pra qualquer processo que liste a tabela de
// processos.

const MIN_PASSWORD_LENGTH = 8;

// Só o host e o nome do banco, nunca usuário e senha: este texto vai para a
// tela e pode acabar colado num chat ou numa issue.
function describeDatabase(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "(DATABASE_URL ilegível)";
  }
}

// Uma interface só para o script inteiro. Abrir e fechar uma por pergunta
// funciona na primeira e trava na segunda: fechar o readline encerra o
// stdin, e a interface seguinte espera para sempre por dados que não vêm
// mais.
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

let muted = false;
// O readline não expõe API pública para input escondido; sobrescrever o
// escritor é o caminho conhecido para isso.
const internal = rl as unknown as { _writeToOutput: (text: string) => void };
const write = internal._writeToOutput.bind(rl);
internal._writeToOutput = (text: string) => {
  if (!muted) write(text);
};

function ask(question: string, { hidden = false } = {}): Promise<string> {
  return new Promise((resolve) => {
    // A pergunta em si sempre aparece; o mudo vale só para o que é digitado
    // em resposta a ela.
    write(question);
    muted = hidden;

    rl.question("", (answer) => {
      muted = false;
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Uso: npm run reset-password -- <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Nenhum usuário com o e-mail ${email} neste banco.`);
    process.exit(1);
  }

  console.log(`Banco:   ${describeDatabase(process.env.DATABASE_URL ?? "")}`);
  console.log(`Usuário: ${user.name} <${user.email}> — ${user.role}`);

  // Confirmação digitada em vez de "s/n": digitar o e-mail inteiro é o que
  // impede trocar a senha do banco errado no piloto automático.
  const confirmation = await ask("\nDigite o e-mail de novo para confirmar: ");
  if (confirmation.trim().toLowerCase() !== email) {
    console.error("Não confere. Nada foi alterado.");
    process.exit(1);
  }

  const password = await ask("Nova senha (não aparece na tela): ", { hidden: true });
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    process.exit(1);
  }

  const repeated = await ask("Repita a senha: ", { hidden: true });
  if (repeated !== password) {
    console.error("As senhas não são iguais. Nada foi alterado.");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    // Limpa qualquer convite pendente: um token de convite ainda válido
    // permitiria definir a senha de novo, por fora deste fluxo.
    data: { password: await hashPassword(password), inviteToken: null, inviteTokenExpiresAt: null },
  });

  console.log(`\nSenha de ${user.email} atualizada.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    rl.close();
    void prisma.$disconnect();
  });
