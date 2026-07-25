import { AuthUser } from "@/lib/auth";

const placeholders = [
  { label: "Reservas hoje", value: "—" },
  { label: "Serviços ativos", value: "—" },
  { label: "Colaboradores", value: "—" },
];

export function PlaceholderOverview({ user }: { user: AuthUser }) {
  const firstName = user.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-xl font-semibold tracking-tight">
        Olá, {firstName} 👋
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {user.business
          ? `Aqui está o resumo de ${user.business.name}.`
          : "Aqui está o resumo da plataforma."}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {placeholders.map((item) => (
          <div key={item.label} className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-dashed bg-card/50 p-8 text-center">
        <p className="text-sm font-medium">Seu negócio está quase pronto</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Os próximos passos — cadastrar serviços e convidar a equipe — chegam
          nas próximas fases.
        </p>
      </div>
    </div>
  );
}
