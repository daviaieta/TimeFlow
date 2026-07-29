import { Badge } from "@/components/ui/badge";
import { TeamAvatar } from "@/components/team-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamRow, formatCurrency, formatPercent } from "@/lib/dashboard";

// Agenda fechada não é desempenho ruim: a barra some e o lugar vira um aviso,
// para o dono não ler 0% como "vendeu mal".
function Occupancy({ row }: { row: TeamRow }) {
  if (row.slots === 0) {
    return (
      <span className="text-xs text-muted-foreground">Sem horários abertos</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${Math.round(row.rate * 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatPercent(row.rate)} · {row.booked}/{row.slots}
      </span>
    </div>
  );
}

function Name({ row }: { row: TeamRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TeamAvatar name={row.name} className="size-9 rounded-xl text-xs" />
      <div className="min-w-0">
        <p className="truncate font-medium">{row.name}</p>
        {row.pendingInvite ? (
          <Badge variant="outline" className="mt-1">
            Convite pendente
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

export function TeamTable({ rows }: { rows: TeamRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nenhum colaborador cadastrado ainda.
      </p>
    );
  }

  return (
    <>
      {/* Mesma escolha da BusinessTable: abaixo de sm a tabela viraria scroll
          horizontal, então cada colaborador vira uma linha empilhada. */}
      <div className="flex flex-col gap-4 sm:hidden">
        {rows.map((row) => (
          <div key={row.id} className="border-b pb-4 last:border-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <Name row={row} />
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatCurrency(row.revenue)}
              </span>
            </div>
            <div className="mt-3">
              <Occupancy row={row} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Ocupação</TableHead>
              <TableHead className="text-right">Receita agendada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Name row={row} />
                </TableCell>
                <TableCell>
                  <Occupancy row={row} />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(row.revenue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
