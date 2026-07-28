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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContactForm(values: ContactFormValues): ContactFormErrors {
  const errors: ContactFormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Informe seu nome.";
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = "Informe seu e-mail.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Informe um e-mail válido.";
  }

  const message = values.message.trim();
  if (!message) {
    errors.message = "Escreva sua mensagem.";
  } else if (message.length > MESSAGE_MAX_LENGTH) {
    errors.message = "Mensagem muito longa (máximo de 2000 caracteres).";
  }

  return errors;
}
