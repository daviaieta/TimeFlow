"use client";

import { FormEvent, useState } from "react";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SLUG_PATTERN, slugify } from "@/lib/platform";

// As mensagens de 409 do servidor são em inglês; o resto da UI é em português.
function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado.";

  if (error.message.includes("slug already exists")) {
    return "Já existe um negócio com esse endereço. Escolha outro.";
  }
  if (error.message.includes("email already exists")) {
    return "Já existe um usuário com esse e-mail.";
  }

  return error.message;
}

export function CreateBusinessDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Enquanto o dono não editar o slug à mão, ele acompanha o nome.
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setAdminName("");
    setAdminEmail("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!SLUG_PATTERN.test(slug)) {
      setError(
        "O endereço só aceita letras minúsculas, números e hífens — como barbearia-do-ze.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await fetchAdapter({
        method: "POST",
        path: "/businesses",
        body: { name, slug, admin: { name: adminName, email: adminEmail } },
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novo negócio</DialogTitle>
            <DialogDescription>
              O administrador recebe um e-mail para definir a senha e assumir o
              negócio.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="business-name">Nome do negócio</FieldLabel>
              <Input
                id="business-name"
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Barbearia do Zé"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="business-slug">Endereço público</FieldLabel>
              <Input
                id="business-slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="barbearia-do-ze"
                required
              />
              <p className="text-xs text-muted-foreground">
                Os clientes vão acessar em /{slug || "barbearia-do-ze"}
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="admin-name">Nome do administrador</FieldLabel>
              <Input
                id="admin-name"
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
                placeholder="José da Silva"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="admin-email">E-mail do administrador</FieldLabel>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="jose@barbearia.com"
                required
              />
            </Field>

            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {submitting ? "Cadastrando…" : "Cadastrar negócio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
