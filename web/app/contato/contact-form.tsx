"use client";

import { FormEvent, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ContactFormErrors,
  ContactFormValues,
  TEAM_SIZE_OPTIONS,
  validateContactForm,
} from "@/lib/contact";

const EMPTY: ContactFormValues = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  teamSize: "",
  message: "",
};

export function ContactForm() {
  const [values, setValues] = useState<ContactFormValues>(EMPTY);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // Honeypot: escondido para humano, visível para bot que varre inputs.
  const [website, setWebsite] = useState("");

  function update(field: keyof ContactFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const found = validateContactForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSending(true);
    setSubmitError(null);

    try {
      await fetchAdapter({
        method: "POST",
        path: "/public/contact",
        body: {
          name: values.name.trim(),
          email: values.email.trim(),
          message: values.message.trim(),
          // Campos opcionais só vão quando preenchidos: o schema da rota
          // recusa string vazia em `teamSize` (é enum).
          ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
          ...(values.businessName.trim()
            ? { businessName: values.businessName.trim() }
            : {}),
          ...(values.teamSize ? { teamSize: values.teamSize } : {}),
          ...(website ? { website } : {}),
        },
      });
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setSubmitError(
          "Você enviou várias mensagens seguidas. Tente novamente em uma hora.",
        );
      } else {
        setSubmitError(
          "Não consegui enviar sua mensagem. Tente de novo em instantes.",
        );
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-indigo-100 bg-card p-10 text-center shadow-sm">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-10 text-primary"
        />
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Mensagem enviada
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Respondo em até 1 dia útil, no e-mail que você informou. Enquanto isso,
          você já pode conferir os planos.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Seu nome</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "name-error" : undefined}
            className="mt-1"
          />
          {errors.name && (
            <p id="name-error" className="mt-1 text-xs text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            className="mt-1"
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-xs text-destructive">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="phone">WhatsApp (opcional)</Label>
          <Input
            id="phone"
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "phone-error" : undefined}
            className="mt-1"
          />
          {errors.phone && (
            <p id="phone-error" className="mt-1 text-xs text-destructive">
              {errors.phone}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="businessName">Nome do negócio (opcional)</Label>
          <Input
            id="businessName"
            value={values.businessName}
            onChange={(event) => update("businessName", event.target.value)}
            aria-invalid={Boolean(errors.businessName)}
            aria-describedby={
              errors.businessName ? "businessName-error" : undefined
            }
            className="mt-1"
          />
          {errors.businessName && (
            <p id="businessName-error" className="mt-1 text-xs text-destructive">
              {errors.businessName}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="teamSize">Quantos profissionais? (opcional)</Label>
          <select
            id="teamSize"
            value={values.teamSize}
            onChange={(event) => update("teamSize", event.target.value)}
            className="mt-1 h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          >
            <option value="">Prefiro não dizer</option>
            {TEAM_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="message">Como posso ajudar?</Label>
          <Textarea
            id="message"
            rows={5}
            value={values.message}
            onChange={(event) => update("message", event.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "message-error" : undefined}
            placeholder="Conte como sua agenda funciona hoje e o que te trouxe aqui."
            className="mt-1"
          />
          {errors.message && (
            <p id="message-error" className="mt-1 text-xs text-destructive">
              {errors.message}
            </p>
          )}
        </div>
      </div>

      {/* Honeypot: fora da tela e fora da ordem de tabulação. */}
      <div aria-hidden className="absolute left-[-9999px]">
        <label htmlFor="website">Não preencha este campo</label>
        <input
          id="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {submitError && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {submitError}
        </p>
      )}

      <Button type="submit" disabled={sending} className="mt-6 w-full sm:w-auto">
        {sending ? "Enviando..." : "Enviar mensagem"}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        Sem robô e sem fila: quem responde é quem construiu o Time Flow.
      </p>
    </form>
  );
}
