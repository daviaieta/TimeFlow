"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Panel } from "@/components/dashboard/panel";
import { CustomerProfile, CustomerTag } from "@/lib/types";

// Etiquetas do prontuário. O vocabulário é do negócio (tela /dashboard/tags);
// aqui só se liga e desliga. Ligar é idempotente no servidor, então clicar
// duas vezes não duplica nada.

export function CustomerTags({
  profile,
  onChanged,
}: {
  profile: CustomerProfile;
  onChanged: () => void;
}) {
  const [vocabulary, setVocabulary] = useState<CustomerTag[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadVocabulary = useCallback(() => {
    return fetchAdapter<{ tags: CustomerTag[] }>({ method: "GET", path: "/tags" })
      .then(({ data }) => setVocabulary(data.tags))
      .catch(() => setVocabulary([]));
  }, []);

  useEffect(() => {
    loadVocabulary();
  }, [loadVocabulary]);

  const attachedIds = new Set(profile.tags.map((tag) => tag.id));
  const available = vocabulary.filter((tag) => !attachedIds.has(tag.id));

  async function attach(tagId: string) {
    setBusy(true);
    setError(null);
    try {
      await fetchAdapter({
        method: "POST",
        path: `/customers/${profile.publicId}/tags/${tagId}`,
      });
      setSelected("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  async function detach(tagId: number) {
    setBusy(true);
    setError(null);
    try {
      await fetchAdapter({
        method: "DELETE",
        path: `/customers/${profile.publicId}/tags/${tagId}`,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Etiquetas"
      description="Como a equipe agrupa este cliente."
    >
      {profile.tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {profile.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-4xl border bg-input/30 py-0.5 pr-1 pl-2 text-xs font-medium"
            >
              {tag.color && (
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
              )}
              {tag.name}
              <button
                type="button"
                aria-label={`Remover etiqueta ${tag.name}`}
                disabled={busy}
                onClick={() => detach(tag.id)}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma etiqueta neste cliente.
        </p>
      )}

      <div className="mt-4">
        {available.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              items={available.map((tag) => ({
                value: String(tag.id),
                label: tag.name,
              }))}
              value={selected}
              onValueChange={(value) => setSelected(value ?? "")}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label="Escolher etiqueta">
                <SelectValue placeholder="Escolher etiqueta" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {available.map((tag) => (
                    <SelectItem key={tag.id} value={String(tag.id)}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={selected === "" || busy}
              onClick={() => attach(selected)}
            >
              Aplicar
            </Button>
          </div>
        ) : vocabulary.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            O negócio ainda não tem etiquetas.{" "}
            <Link href="/dashboard/tags" className="underline hover:text-foreground">
              Criar a primeira
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todas as etiquetas já estão neste cliente.
          </p>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* A badge do topo some no mobile; repetir a contagem aqui evita a
          impressão de que a lista está vazia enquanto carrega. */}
      {profile.tags.length > 0 && (
        <Badge variant="ghost" className="mt-3">
          {profile.tags.length}{" "}
          {profile.tags.length === 1 ? "etiqueta" : "etiquetas"}
        </Badge>
      )}
    </Panel>
  );
}
