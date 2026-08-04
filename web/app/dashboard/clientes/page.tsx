"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { ApiError, fetchAdapter } from "@/adapters/fetchAdapter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import {
  appendProfiles,
  buildCustomersQuery,
  customerContactLine,
  customerStatusLabels,
  formatDate,
} from "@/lib/crm";
import { formatCurrency } from "@/lib/dashboard";
import { CustomerProfile, CustomerStatus, CustomerTag } from "@/lib/types";
import { useAuthUser } from "../auth-context";
import { CustomerFormDialog } from "./customer-form-dialog";
import { CustomersMetrics } from "./customers-metrics";

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const user = useAuthUser();
  const isAdmin = user.role === "ADMIN";

  // null = ainda não carregou. Distinguir de [] é o que permite mostrar o
  // esqueleto na primeira carga e o estado vazio depois dela.
  const [profiles, setProfiles] = useState<CustomerProfile[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [tags, setTags] = useState<CustomerTag[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerStatus | "ALL">("ALL");
  const [tagId, setTagId] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Digitar filtra, mas não a cada tecla: sem o atraso, "ana" dispara três
  // requisições e a terceira pode voltar antes da segunda.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Nunca rejeita: o erro de rede vira estado, para que o `await` dentro da
  // transition sempre resolva e o `isPending` volte a false mesmo na falha.
  const loadFirstPage = useCallback(() => {
    return fetchAdapter<{ profiles: CustomerProfile[]; nextCursor: string | null }>({
      method: "GET",
      path: `/customers${buildCustomersQuery({ search, status, tagId, limit: PAGE_SIZE })}`,
    })
      .then(({ data }) => {
        setProfiles(data.profiles);
        setNextCursor(data.nextCursor);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
      });
  }, [search, status, tagId]);

  // Dentro de uma transition (em vez de um setState síncrono no corpo do
  // efeito) para não disparar `react-hooks/set-state-in-effect` e para que
  // `isPending` sirva de indicador de carregamento.
  useEffect(() => {
    startTransition(async () => {
      await loadFirstPage();
    });
  }, [loadFirstPage]);

  const loading = profiles === null || isPending;
  const rows = profiles ?? [];

  // As etiquetas alimentam o filtro. Falha aqui não derruba a lista: o filtro
  // some, a listagem continua.
  useEffect(() => {
    fetchAdapter<{ tags: CustomerTag[] }>({ method: "GET", path: "/tags" })
      .then(({ data }) => setTags(data.tags))
      .catch(() => setTags([]));
  }, []);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    fetchAdapter<{ profiles: CustomerProfile[]; nextCursor: string | null }>({
      method: "GET",
      path: `/customers${buildCustomersQuery({
        search,
        status,
        tagId,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      })}`,
    })
      .then(({ data }) => {
        setProfiles((current) => appendProfiles(current ?? [], data.profiles));
        setNextCursor(data.nextCursor);
        setListError(null);
      })
      .catch((err) => {
        setListError(err instanceof ApiError ? err.message : "Erro inesperado.");
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }

  const filtering = search !== "" || status !== "ALL" || tagId !== null;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem já passou pelo seu negócio — histórico, observações e
            fidelidade.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Novo cliente
        </Button>
      </div>

      {isAdmin && (
        <div className="mt-8">
          <CustomersMetrics />
        </div>
      )}

      {notice && (
        <div className="mt-6 rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm">
          {notice}{" "}
          <button
            type="button"
            className="text-muted-foreground underline hover:text-foreground"
            onClick={() => setNotice(null)}
          >
            ok
          </button>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Buscar por nome, telefone ou e-mail"
          aria-label="Buscar clientes"
          className="sm:max-w-xs"
        />

        <Select
          items={[
            { value: "ALL", label: "Todas as situações" },
            { value: "ACTIVE", label: "Ativos" },
            { value: "BLOCKED", label: "Bloqueados" },
          ]}
          value={status}
          onValueChange={(value) =>
            setStatus((value as CustomerStatus | "ALL" | null) ?? "ALL")
          }
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="ALL">Todas as situações</SelectItem>
              <SelectItem value="ACTIVE">Ativos</SelectItem>
              <SelectItem value="BLOCKED">Bloqueados</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {tags.length > 0 && (
          <Select
            items={[
              { value: "ALL", label: "Todas as etiquetas" },
              ...tags.map((tag) => ({ value: String(tag.id), label: tag.name })),
            ]}
            value={tagId === null ? "ALL" : String(tagId)}
            onValueChange={(value) =>
              setTagId(!value || value === "ALL" ? null : Number(value))
            }
          >
            <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por etiqueta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL">Todas as etiquetas</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={String(tag.id)}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : listError ? (
          <p className="p-12 text-center text-sm text-destructive">{listError}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            title={
              filtering
                ? "Nenhum cliente com esses filtros"
                : "Nenhum cliente ainda"
            }
            description={
              filtering
                ? "Ajuste a busca ou limpe os filtros para ver a carteira inteira."
                : "A ficha nasce sozinha na primeira reserva pela página pública. Para quem chega no balcão, cadastre aqui."
            }
            action={
              filtering ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchInput("");
                    setStatus("ALL");
                    setTagId(null);
                  }}
                >
                  Limpar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                  Cadastrar cliente
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Contato</TableHead>
                  <TableHead className="hidden lg:table-cell">Etiquetas</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Valor
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Última
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((profile) => (
                  <TableRow key={profile.publicId}>
                    <TableCell>
                      <Link
                        href={`/dashboard/clientes/${profile.publicId}`}
                        className="font-medium hover:underline"
                      >
                        {profile.displayName}
                      </Link>
                      {profile.status === "BLOCKED" && (
                        <Badge variant="destructive" className="ml-2">
                          {customerStatusLabels.BLOCKED}
                        </Badge>
                      )}
                      {/* No celular a coluna de contato some; sem isto o
                          telefone ficaria inacessível justamente no aparelho
                          que serve para ligar. */}
                      <span className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                        {customerContactLine(profile)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {customerContactLine(profile)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {profile.tags.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {profile.tags.map((tag) => (
                            <Badge key={tag.id} variant="outline">
                              {tag.color && (
                                <span
                                  aria-hidden
                                  className="size-2 rounded-full"
                                  style={{ backgroundColor: tag.color }}
                                />
                              )}
                              {tag.name}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {profile.bookingsCount}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatCurrency(profile.totalSpent)}
                      {profile.spendIsEstimated && (
                        <span
                          className="ml-1 text-muted-foreground"
                          title="Inclui reservas anteriores ao registro de preço: o valor é uma estimativa."
                        >
                          ~
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {formatDate(profile.lastBookedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {nextCursor && !loading && !listError && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? (
              <>
                <Spinner data-icon="inline-start" />
                Carregando…
              </>
            ) : (
              "Carregar mais"
            )}
          </Button>
        </div>
      )}

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={null}
        onSaved={(profile, created) => {
          // O servidor responde 200 quando o contato já tinha ficha aqui.
          // Dizer isso evita o atendente achar que cadastrou duplicado.
          setNotice(
            created
              ? `Cliente “${profile.displayName}” cadastrado.`
              : `“${profile.displayName}” já tinha ficha neste negócio — abrimos a que já existia.`,
          );
          loadFirstPage();
        }}
      />
    </div>
  );
}
