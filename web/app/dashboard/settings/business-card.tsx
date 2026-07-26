"use client";

import { FormEvent, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SLUG_PATTERN } from "@/lib/platform";
import { useRefreshAuthUser } from "../auth-context";

function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado.";

  if (error.status === 409) return "Já existe um negócio com esse endereço público.";
  if (error.status === 403) return "Você não tem permissão para editar este negócio.";
  if (error.status === 400) return "Confira os dados e tente novamente.";

  return error.message;
}

export function BusinessCard({
  business,
}: {
  business: { id: number; name: string; slug: string; address: string | null };
}) {
  const refresh = useRefreshAuthUser();

  const [name, setName] = useState(business.name);
  const [slug, setSlug] = useState(business.slug);
  const [address, setAddress] = useState(business.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const slugChanged = slug !== business.slug;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!SLUG_PATTERN.test(slug)) {
      setError(
        "O endereço só aceita letras minúsculas, números e hífens — como barbearia-do-ze.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await fetchAdapter({
        method: "PUT",
        path: `/businesses/${business.id}`,
        // Campo vazio é ausência de endereço, não string vazia no banco.
        body: {
          name,
          slug,
          address: address.trim() === "" ? null : address.trim(),
        },
      });
      setSaved(true);
      await refresh();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Seu negócio</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        O que seus clientes veem na página pública.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="business-name">Nome</FieldLabel>
            <Input
              id="business-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="business-slug">Endereço público</FieldLabel>
            <Input
              id="business-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              required
            />
            <FieldDescription>
              Seus clientes acessam em{" "}
              {/* window só existe no cliente; o texto não precisa bater
                  entre servidor e cliente, é só apresentação. */}
              <span suppressHydrationWarning>
                {typeof window !== "undefined" ? window.location.origin : ""}/
                {slug || business.slug}
              </span>
              {slugChanged ? (
                <span className="mt-1 block font-medium text-amber-700 dark:text-amber-500">
                  Ao salvar, o endereço antigo (/{business.slug}) para de
                  funcionar. Links já divulgados vão dar erro.
                </span>
              ) : null}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="business-address">Endereço</FieldLabel>
            <Input
              id="business-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Rua das Flores, 123 — Centro"
            />
            <FieldDescription>
              Opcional. Deixe em branco se não tiver ponto fixo.
            </FieldDescription>
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}
          {saved && !error ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Negócio atualizado.
            </p>
          ) : null}

          <Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
