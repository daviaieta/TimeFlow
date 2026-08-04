"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  buildCustomersQuery,
  customerContactLine,
  shouldSearchCustomers,
} from "@/lib/crm";
import type { CustomerProfile } from "@/lib/types";

interface CustomerPickerProps {
  selected: CustomerProfile | null;
  onSelect: (profile: CustomerProfile | null) => void;
}

// Busca digitada: espera o dedo parar antes de perguntar ao servidor. 250ms é
// curto o bastante para parecer instantâneo e longo o bastante para "Davi" ser
// uma requisição em vez de quatro.
const DEBOUNCE_MS = 250;

// Cinco cabem sem rolagem no diálogo e sem empurrar o formulário para fora da
// tela do celular. Quem não achou nas cinco primeiras refina o termo — é mais
// rápido do que percorrer vinte.
const MAX_RESULTS = 5;

// Escolher o cliente antes de digitar o nome é o que impede o prontuário
// duplicado: sem isto, o regular que trocou de celular vira um cadastro novo na
// próxima reserva de balcão (a resolução por canal não tem como saber que é o
// mesmo). Com prontuário fixado, o servidor pula a resolução por canal.
export function CustomerPicker({ selected, onSelect }: CustomerPickerProps) {
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<{ term: string; profiles: CustomerProfile[] } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  // CRM desligado no servidor: a rota não existe. O campo some inteiro em vez
  // de oferecer uma busca que nunca acha ninguém.
  const [unavailable, setUnavailable] = useState(false);

  const trimmed = term.trim();
  const searchable = shouldSearchCustomers(trimmed);

  useEffect(() => {
    if (!searchable) return;

    // `active` derruba resposta atrasada: sem ele, o resultado lento de "da"
    // pode chegar depois do de "davi" e substituir a lista certa pela antiga.
    let active = true;
    const handle = setTimeout(() => {
      fetchAdapter<{ profiles: CustomerProfile[] }>({
        method: "GET",
        path: `/customers${buildCustomersQuery({ search: trimmed, limit: MAX_RESULTS })}`,
      })
        .then(({ data }) => {
          if (!active) return;
          setMatches({ term: trimmed, profiles: data.profiles });
          setFailed(false);
        })
        .catch((err) => {
          if (!active) return;
          if (err instanceof ApiError && err.status === 404) {
            setUnavailable(true);
            return;
          }
          setFailed(true);
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [trimmed, searchable]);

  if (unavailable) return null;

  if (selected) {
    return (
      <Field>
        <FieldLabel>Cliente cadastrado</FieldLabel>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <HugeiconsIcon icon={UserGroupIcon} className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {customerContactLine(selected)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect(null);
              setTerm("");
              setMatches(null);
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" />
            Trocar
          </Button>
        </div>
        <FieldDescription>
          A reserva fica no prontuário deste cliente. Os campos abaixo podem ser
          ajustados — eles guardam o que foi combinado nesta reserva.
        </FieldDescription>
      </Field>
    );
  }

  // Só renderiza a lista da busca ATUAL: enquanto a próxima não chega, o termo
  // guardado não bate com o digitado e a lista antiga não fica na tela dizendo
  // algo que já não é verdade.
  const current = matches?.term === trimmed ? matches.profiles : null;
  const searching = searchable && current === null && !failed;

  return (
    <Field>
      <FieldLabel htmlFor="booking-customer">Cliente cadastrado (opcional)</FieldLabel>
      <Input
        id="booking-customer"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Buscar por nome"
        autoComplete="off"
      />

      {searching && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          Buscando…
        </p>
      )}

      {failed && (
        <FieldDescription>
          Não foi possível buscar agora. Dá para reservar preenchendo os dados
          abaixo.
        </FieldDescription>
      )}

      {current !== null && current.length === 0 && (
        <FieldDescription>
          Nenhum cliente com esse nome. Preencha os dados abaixo e o cadastro é
          criado com a reserva.
        </FieldDescription>
      )}

      {current !== null && current.length > 0 && (
        <ul className="divide-y rounded-md border">
          {current.map((profile) => (
            <li key={profile.publicId}>
              <button
                type="button"
                onClick={() => onSelect(profile)}
                className="w-full px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="block truncate text-sm font-medium">
                  {profile.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {customerContactLine(profile)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searchable && !selected && (
        <FieldDescription>
          Digite ao menos duas letras. Sem escolher ninguém, a reserva cria ou
          reencontra o cadastro pelo telefone.
        </FieldDescription>
      )}
    </Field>
  );
}
