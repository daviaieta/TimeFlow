const DEFAULT_EMAIL = "superadmin@timeflow.com";
// Esta senha está no repositório público. Serve para dev e para nada mais.
const DEFAULT_PASSWORD = "SuperAdmin123!";

interface SeedSource {
  nodeEnv: string;
  email?: string;
  password?: string;
}

export interface SeedCredentials {
  email: string;
  password: string;
}

export function resolveSeedCredentials(source: SeedSource): SeedCredentials {
  const isProduction = source.nodeEnv === "production";
  const password = source.password ?? DEFAULT_PASSWORD;

  if (isProduction && password === DEFAULT_PASSWORD) {
    throw new Error(
      "SEED_SUPERADMIN_PASSWORD é obrigatória em produção: a senha padrão está publicada no repositório.",
    );
  }

  return { email: source.email ?? DEFAULT_EMAIL, password };
}

// O usuário de convite pendente existe para testar o fluxo de aceite à mão.
// Em produção seria só uma conta órfã com token válido.
export function shouldSeedTestInvite(nodeEnv: string): boolean {
  return nodeEnv !== "production";
}
