export interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  teamSize: string;
  message: string;
}

export type ContactFormErrors = Partial<Record<keyof ContactFormValues, string>>;

// Os valores batem com o enum de `teamSize` no schema de POST /public/contact.
export const TEAM_SIZE_OPTIONS = [
  { value: "1", label: "Só eu" },
  { value: "2-5", label: "2 a 5 profissionais" },
  { value: "6+", label: "6 ou mais" },
];

export const MESSAGE_MAX_LENGTH = 2000;

// Os limites abaixo espelham `contactSchema` em
// `server/src/routes/publicRoutes.ts` — sem isso, passar do limite de um
// campo opcional gera um 400 genérico no servidor sem apontar o campo.
export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 120;
export const PHONE_MAX_LENGTH = 20;
export const BUSINESS_NAME_MAX_LENGTH = 80;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactForm(values: ContactFormValues): ContactFormErrors {
  const errors: ContactFormErrors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = "Informe seu nome.";
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Nome muito longo (máximo de ${NAME_MAX_LENGTH} caracteres).`;
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = "Informe seu e-mail.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Informe um e-mail válido.";
  } else if (email.length > EMAIL_MAX_LENGTH) {
    errors.email = `E-mail muito longo (máximo de ${EMAIL_MAX_LENGTH} caracteres).`;
  }

  const phone = values.phone.trim();
  if (phone.length > PHONE_MAX_LENGTH) {
    errors.phone = `Telefone muito longo (máximo de ${PHONE_MAX_LENGTH} caracteres).`;
  }

  const businessName = values.businessName.trim();
  if (businessName.length > BUSINESS_NAME_MAX_LENGTH) {
    errors.businessName = `Nome do negócio muito longo (máximo de ${BUSINESS_NAME_MAX_LENGTH} caracteres).`;
  }

  const message = values.message.trim();
  if (!message) {
    errors.message = "Escreva sua mensagem.";
  } else if (message.length > MESSAGE_MAX_LENGTH) {
    errors.message = "Mensagem muito longa (máximo de 2000 caracteres).";
  }

  return errors;
}
