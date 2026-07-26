import { Badge } from "@/components/ui/badge";
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

export function BusinessTable({ businesses }: { businesses: BusinessRow[] }) {
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
