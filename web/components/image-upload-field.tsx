"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ApiError, fetchAdapter, uploadAdapter } from "@/adapters/fetchAdapter";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ImagePreset } from "@/lib/image";
import { resizeToWebp } from "@/lib/imageFile";
import { cn } from "@/lib/utils";

interface ImageUploadFieldProps {
  label: string;
  description: string;
  preset: ImagePreset;
  currentUrl: string | null;
  /** Caminho na API. POST envia, DELETE remove. */
  uploadPath: string;
  onDone: (url: string | null) => void | Promise<void>;
  shape?: "square" | "wide";
}

function translateError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Erro inesperado.";
  }

  if (error.status === 400) return "Envie uma imagem JPG, PNG ou WebP de até 2 MB.";
  if (error.status === 413) return "A imagem é grande demais. Escolha uma menor.";
  if (error.status === 403) return "Você não tem permissão para trocar esta imagem.";

  return error.message;
}

export function ImageUploadField({
  label,
  description,
  preset,
  currentUrl,
  uploadPath,
  onDone,
  shape = "square",
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Limpa aqui e não no fim: sem isto, escolher o mesmo arquivo de novo
    // depois de um erro não dispara change nenhum.
    event.target.value = "";
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const blob = await resizeToWebp(file, preset);
      const data = await uploadAdapter<{
        business?: { logoUrl: string | null; bannerUrl: string | null };
        employee?: { avatarUrl: string | null };
      }>({ path: uploadPath, file: blob });

      await onDone(extractUrl(data, uploadPath));
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      await fetchAdapter({ method: "DELETE", path: uploadPath });
      await onDone(null);
    } catch (err) {
      setError(translateError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>

      <div className="flex items-center gap-4">
        {currentUrl ? (
          // URL de bucket externo, sem domínio conhecido de antemão para
          // configurar em next/image — mesma razão do BusinessMark.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt=""
            className={cn(
              "rounded-2xl border object-cover",
              shape === "wide" ? "h-20 w-48" : "size-20",
            )}
          />
        ) : (
          <div
            aria-hidden
            className={cn(
              "rounded-2xl border border-dashed bg-muted/40",
              shape === "wide" ? "h-20 w-48" : "size-20",
            )}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {currentUrl ? "Trocar" : "Enviar imagem"}
          </Button>

          {currentUrl ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={handleRemove}>
              Remover
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />

      <FieldDescription>{description}</FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

function extractUrl(
  data: {
    business?: { logoUrl: string | null; bannerUrl: string | null };
    employee?: { avatarUrl: string | null };
  },
  uploadPath: string,
): string | null {
  if (data.employee) return data.employee.avatarUrl;
  if (!data.business) return null;

  return uploadPath.endsWith("/banner") ? data.business.bannerUrl : data.business.logoUrl;
}
