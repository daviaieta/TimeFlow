# Gerador de carga horária + página pública vitrine — design

**Data:** 2026-07-24
**Branch:** `feat/work-schedule` (empilhado sobre `feat/public-booking`)
**Contexto:** o colaborador cria horários um a um pelo dialog "Novo horário" — abrir uma
agenda de um mês inteiro é inviável. A página pública funciona, mas apresenta pouco
sobre o negócio. O principal desta feature é o gerador; a vitrine vem junto.

## Decisões

- **Gerador pontual por período** (contra template salvo e contra cálculo virtual): um
  formulário materializa `Availability` de uma vez. Zero mudança de schema; reserva,
  trava, agenda e página pública continuam intocadas. Template persistente fica de
  follow-up se a dor aparecer.
- **Página pública na direção "vitrine"** (escolhida em mockup): hero com identidade,
  serviços com próximo horário vago, seção de profissionais. Wizard interno inalterado.

## 1. Gerador (servidor)

### `POST /availabilities/generate` — auth EMPLOYEE

```ts
{
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;     // >= startDate; período máx. 62 dias
  weekdays: number[];  // 0=dom … 6=sáb; 1..7 itens únicos
  workStart: string;   // "HH:mm"
  workEnd: string;     // > workStart
  breakStart?: string; // almoço opcional — os dois ou nenhum
  breakEnd?: string;   // workStart < breakStart < breakEnd <= workEnd
  slotMinutes: 15 | 30 | 45 | 60 | 90;
}
```

Resposta: `{ created: number, skipped: number }`. Schema com
`additionalProperties: false`; validações de coerência (datas, almoço dentro do
expediente, cap de 62 dias) no service com `BadRequestError`.

### Lógica pura — `server/src/services/availabilityGenerator.ts`

- `sliceWorkday({ workStart, workEnd, breakStart?, breakEnd? }, slotMinutes)` →
  `{ startTime, endTime }[]`. Slot entra só se couber inteiro: termina até o início do
  almoço, recomeça no fim dele, último termina até `workEnd`.
  Ex.: 09–18h, almoço 12–13h, 30min → 16 slots.
- `enumerateDays(startDate, endDate, weekdays)` → `string[]` de day keys. Dia da semana
  via UTC (datas são meia-noite UTC no banco, mesma convenção de
  `buildAvailabilityData`).
- `filterAgainstExisting(plan, existing)` → `{ kept, skipped }`. Pula por
  **sobreposição de intervalo** no mesmo dia (`aStart < bEnd && bStart < aEnd`), não só
  `startTime` igual — um horário manual 09:15–10:15 bloqueia os slots gerados que o
  cruzam. Reservados nunca são tocados (são `existing` como quaisquer outros).
- Corte do passado: reuso de `isSlotUpcoming` (de `publicBookingRules`) — gerar hoje às
  14h não cria os slots da manhã.

### Service e repository

`availabilityService.generateAvailabilities(employeeId, input)`:
valida → `availabilityRepository.findManyByEmployeeInRange(employeeId, from, to)` →
monta plano puro → filtra sobreposição e passado → `createMany` (com
`skipDuplicates: true`; o `@@unique([employeeId, date, startTime])` é o backstop) →
`{ created, skipped }` onde `skipped` = plano − criados.

## 2. UI do gerador (agenda do colaborador)

Botão **"Gerar horários"** (outline) ao lado de "Novo horário". Dialog:
período (de/até, default hoje → +30 dias), chips dos 7 dias (seg–sex pré-marcados),
expediente (09:00–18:00 default), toggle "Pausa para almoço" revelando os dois
horários, select da duração (default 30min). Rodapé com estimativa ao vivo
("≈ 112 horários") calculada por função pura no front
(`web/lib/generatePlan.ts: estimateGeneratedSlots`) — espelho leve da lógica do
servidor, que continua sendo a fonte da verdade. Ao confirmar: resultado
("112 criados · 3 pulados") e reload da agenda. O dialog manual continua para encaixes.

## 3. Página pública vitrine

### API — catálogo enriquecido

`GET /public/businesses/:slug` ganha:

- `professionals: { id, name, nextSlot: { date, startTime } | null }[]` no topo —
  união dos profissionais vinculados a serviços;
- cada `services[].employees[]` ganha o mesmo `nextSlot`.

Cálculo: uma query (`findManyFreeByBusiness`: slots livres do negócio ordenados por
data/hora) + função pura `firstUpcomingPerEmployee(slots, now)` que devolve o primeiro
slot futuro de cada profissional. Os testes existentes de `toPublicBusinessDto` são
atualizados para o novo shape.

### Página (`/[slug]`)

Passo 1 vira vitrine; passos 2–4 e sucesso mantêm o layout atual:

- **Hero**: gradiente indigo→violeta, monograma, nome formatado, tagline "Agende online
  em menos de 1 minuto — sem criar conta", mini-estatísticas (nº serviços, nº
  profissionais, "Hoje tem vaga" quando o menor `nextSlot` é hoje).
- **Cards de serviço**: nome, duração, preço, quem atende, "Próximo: Hoje 14:00"
  (menor `nextSlot` entre os profissionais do serviço; ausente quando ninguém tem vaga).
- **Profissionais**: cards com inicial, nome e próxima vaga (informativos).
- **Rodapé**: "⚡ Time Flow" → link para `/`.

Helper puro novo em `web/lib/publicBooking.ts`: `nextSlotLabel(slot, todayKey)` →
"Hoje 14:00" / "seg, 27 jul 09:00" (composição com `dayChipLabel`).

## 4. Testes

- **Servidor** (`availabilityGenerator.test.ts`): fatiamento com/sem almoço, slot que
  não cabe no fim do expediente/antes do almoço, enumeração de dias por weekday,
  sobreposição (manual no meio do expediente), cap de dias inválido não chega ao puro
  (service); `firstUpcomingPerEmployee` em `publicBookingRules.test.ts`.
- **Web**: `estimateGeneratedSlots` e `nextSlotLabel`.
- **curl**: gerar → `{created: N}`; repetir → `{created: 0, skipped: N}` (idempotente);
  catálogo público com `nextSlot`; agenda pública mostrando os dias gerados.

## Follow-ups

- Template de jornada persistente (WorkSchedule) com horizonte automático.
- Exclusão em massa de horários gerados (hoje: um a um).
