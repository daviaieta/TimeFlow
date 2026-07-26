import { HugeiconsIcon } from "@hugeicons/react";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BusinessRow,
  businessStatus,
  formatCreatedAt,
  formatTeam,
} from "@/lib/platform";

function StatusBadge({ row }: { row: BusinessRow }) {
  const pending = businessStatus(row) === "pending";

  return (
    <Badge variant={pending ? "outline" : "default"}>
      {pending ? "Convite pendente" : "Ativo"}
    </Badge>
  );
}

function ResendButton({
  row,
  onResend,
  resending,
  resent,
}: {
  row: BusinessRow;
  onResend: (row: BusinessRow) => void;
  resending: boolean;
  resent: boolean;
}) {
  // Nada a reenviar num negócio cujo admin já assumiu.
  if (businessStatus(row) === "active") return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={resending || resent}
      onClick={() => onResend(row)}
    >
      {resending ? <Spinner /> : <HugeiconsIcon icon={Mail01Icon} data-icon="inline-start" />}
      {resent ? "Convite enviado" : resending ? "Enviando…" : "Reenviar convite"}
    </Button>
  );
}

export function BusinessTable({
  businesses,
  onResend,
  resendingId,
  resentId,
}: {
  businesses: BusinessRow[];
  onResend: (row: BusinessRow) => void;
  resendingId: number | null;
  resentId: number | null;
}) {
  return (
    <>
      {/* Abaixo de sm a tabela viraria scroll horizontal; cada negócio vira card. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {businesses.map((row) => (
          <div key={row.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="truncate text-sm text-muted-foreground">/{row.slug}</p>
              </div>
              <StatusBadge row={row} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{formatTeam(row)}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              Criado em {formatCreatedAt(row.createdAt)}
            </p>
            <div className="mt-3 empty:mt-0">
              <ResendButton
                row={row}
                onResend={onResend}
                resending={resendingId === row.id}
                resent={resentId === row.id}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Negócio</TableHead>
              <TableHead>Equipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-sm text-muted-foreground">/{row.slug}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatTeam(row)}
                </TableCell>
                <TableCell>
                  <StatusBadge row={row} />
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatCreatedAt(row.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <ResendButton
                    row={row}
                    onResend={onResend}
                    resending={resendingId === row.id}
                    resent={resentId === row.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
