export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  teamSize?: string;
  message: string;
  // Campo escondido no formulário. Humano nunca preenche; bot que varre
  // inputs, sim.
  website?: string;
}

export interface NormalizedContact {
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
}

export const CONTACT_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };

export function isBot(input: Pick<ContactInput, "website">): boolean {
  return Boolean(input.website?.trim());
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeContact(input: ContactInput): NormalizedContact {
  return {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: optional(input.phone),
    businessName: optional(input.businessName),
    teamSize: optional(input.teamSize),
    message: input.message.trim(),
  };
}

