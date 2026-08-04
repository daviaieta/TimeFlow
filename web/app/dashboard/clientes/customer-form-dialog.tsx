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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { CustomerProfile, CustomerStatus } from "@/lib/types";

// Um formulário só para cadastrar e editar: os campos são os mesmos, o que
// muda é o verbo e o fato de o status só existir na edição (todo cadastro
// nasce ACTIVE). Duas telas quase iguais divergiriam na primeira correção.

export function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null = cadastro novo.
  editing: CustomerProfile | null;
  // Recebe o prontuário salvo e se ele já existia (o servidor responde 200 +
  // created:false quando o contato já tinha cadastro aqui).
  onSaved: (profile: CustomerProfile, created: boolean) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [displayEmail, setDisplayEmail] = useState("");
  const [status, setStatus] = useState<CustomerStatus>("ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Recarrega os campos toda vez que o diálogo abre: sem isto, editar um
  // cliente depois de outro mostraria os dados do anterior por um instante.
  //
  // Ajuste durante o render (e não num efeito) porque é exatamente o caso que
  // o React documenta para "resetar estado quando uma prop muda": o efeito
  // renderizaria uma vez com os dados errados antes de corrigir, e ainda cairia
  // no lint `react-hooks/set-state-in-effect`.
  const openedFor = open ? (editing?.publicId ?? "novo") : null;
  const [lastOpenedFor, setLastOpenedFor] = useState<string | null>(null);

  if (openedFor !== null && openedFor !== lastOpenedFor) {
    setLastOpenedFor(openedFor);
    setDisplayName(editing?.displayName ?? "");
    setDisplayPhone(editing?.displayPhone ?? "");
    setDisplayEmail(editing?.displayEmail ?? "");
    setStatus(editing?.status ?? "ACTIVE");
    setError(null);
  }
  // Solta a trava ao fechar para que reabrir no MESMO cliente também recarregue
  // os campos — senão uma edição cancelada voltaria com o texto abandonado.
  if (openedFor === null && lastOpenedFor !== null) {
    setLastOpenedFor(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (editing) {
        // PATCH manda null (não string vazia) para limpar o campo: é assim que
        // a API distingue "apaga" de "não mexe".
        const { data } = await fetchAdapter<{ profile: CustomerProfile }>({
          method: "PATCH",
          path: `/customers/${editing.publicId}`,
          body: {
            displayName,
            displayPhone: displayPhone.trim() === "" ? null : displayPhone,
            displayEmail: displayEmail.trim() === "" ? null : displayEmail,
            status,
          },
        });
        onSaved(data.profile, false);
      } else {
        const { data } = await fetchAdapter<{
          profile: CustomerProfile;
          created: boolean;
        }>({
          method: "POST",
          path: "/customers",
          body: {
            displayName,
            ...(displayPhone.trim() === "" ? {} : { displayPhone }),
            ...(displayEmail.trim() === "" ? {} : { displayEmail }),
          },
        });
        onSaved(data.profile, data.created);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Atualize como este negócio conhece o cliente."
              : "Cadastre um cliente atendido no balcão. Se o contato já tiver ficha aqui, ela é reaproveitada em vez de duplicada."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="customer-name">Nome</FieldLabel>
              <Input
                id="customer-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Ex.: Ana Souza"
                maxLength={120}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="customer-phone">Telefone</FieldLabel>
              <Input
                id="customer-phone"
                type="tel"
                inputMode="tel"
                value={displayPhone}
                onChange={(event) => setDisplayPhone(event.target.value)}
                placeholder="(11) 99999-8888"
                maxLength={32}
              />
              <FieldDescription>
                Com DDD. É por ele que a próxima reserva do mesmo cliente
                reencontra esta ficha.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="customer-email">E-mail</FieldLabel>
              <Input
                id="customer-email"
                type="email"
                value={displayEmail}
                onChange={(event) => setDisplayEmail(event.target.value)}
                placeholder="ana@exemplo.com"
                maxLength={160}
              />
            </Field>

            {editing && (
              <Field>
                <FieldLabel htmlFor="customer-status">Situação</FieldLabel>
                <Select
                  items={[
                    { value: "ACTIVE", label: "Ativo" },
                    { value: "BLOCKED", label: "Bloqueado" },
                  ]}
                  value={status}
                  onValueChange={(value) =>
                    setStatus((value as CustomerStatus | null) ?? "ACTIVE")
                  }
                >
                  <SelectTrigger id="customer-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="ACTIVE">Ativo</SelectItem>
                      <SelectItem value="BLOCKED">Bloqueado</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Bloquear é uma anotação para a equipe: não impede a reserva
                  pela página pública.
                </FieldDescription>
              </Field>
            )}

            {error && <FieldError>{error}</FieldError>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Salvando…
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
