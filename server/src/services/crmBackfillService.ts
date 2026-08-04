import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { crmBackfillRepository } from "../repositories/crmBackfillRepository";
import {
  aggregateFromBookings,
  BackfillBooking,
  BookingGroup,
  displayFieldsFor,
  existingProfileId,
  groupBookings,
  pendingBookings,
} from "./crmBackfillRules";

// Backfill histórico do CRM (§8 fase 3). A única parte do sistema que escreve
// em linha que já existia.
//
// Três propriedades, e cada uma tem um mecanismo, não uma intenção:
//
//   idempotente     -> só toca reserva com profileId nulo, e o agregado é
//                      RECALCULADO das linhas em vez de incrementado;
//   interrompível   -> uma transação por grupo, então matar o processo deixa os
//                      grupos concluídos inteiros e os outros intocados;
//   determinístico  -> negócios em ordem de id, grupos em ordem de chave,
//                      reservas em ordem de id. Reivindicar canal é corrida
//                      global entre negócios, então ordem instável mudaria o
//                      resultado a cada execução.
//
// NÃO faz fusão de identidade entre negócios. Duas reservas com o mesmo e-mail
// em negócios diferentes viram duas identidades PROVISIONAL separadas, e só um
// login verificado as junta depois (§4.3). O caminho contrário — unificar por
// e-mail não verificado — entregaria o histórico de uma pessoa num negócio a
// quem digitou o mesmo endereço em outro.

export interface BackfillReport {
  businesses: number;
  bookingsCandidate: number;
  bookingsAlreadyLinked: number;
  bookingsLinked: number;
  bookingsUnresolved: number;
  groups: number;
  profilesCreated: number;
  profilesReused: number;
  customersCreated: number;
  customersClaimingEmail: number;
  customersClaimingPhone: number;
  customersWithoutChannel: number;
  profilesExactSpend: number;
  profilesEstimatedSpend: number;
}

function emptyReport(): BackfillReport {
  return {
    businesses: 0,
    bookingsCandidate: 0,
    bookingsAlreadyLinked: 0,
    bookingsLinked: 0,
    bookingsUnresolved: 0,
    groups: 0,
    profilesCreated: 0,
    profilesReused: 0,
    customersCreated: 0,
    customersClaimingEmail: 0,
    customersClaimingPhone: 0,
    customersWithoutChannel: 0,
    profilesExactSpend: 0,
    profilesEstimatedSpend: 0,
  };
}

// Sinaliza fim de simulação: desfaz tudo que o dry-run escreveu. Precisa ser
// exceção — é o único jeito de fazer o Prisma abortar a transação.
class DryRunRollback extends Error {}

async function processGroup(
  tx: Prisma.TransactionClient,
  businessId: number,
  group: BookingGroup,
  report: BackfillReport,
): Promise<void> {
  const pendingIds = pendingBookings(group).map((booking) => booking.id);

  // Reexecução, ou grupo que a escrita ao vivo já tocou: o prontuário do
  // contato vem de uma reserva do próprio grupo que já está vinculada. Não vem
  // do canal — se outro negócio reivindicou o e-mail primeiro, a identidade
  // criada aqui ficou com email nulo e a busca por canal não a encontraria,
  // produzindo um prontuário duplicado a cada reexecução.
  let profileId = existingProfileId(group);

  if (profileId !== null) {
    report.profilesReused += 1;
  } else {
    const owner = await crmBackfillRepository.channelOwner(tx, group.key);
    // Canal já reivindicado por outra identidade — tipicamente a mesma pessoa
    // em outro negócio, processado antes por ter id menor. A identidade nova
    // nasce SEM canal em vez de tentar reusar a existente: reusar seria fusão
    // entre negócios por canal não verificado.
    const claimable = owner === null;

    const customer = await crmBackfillRepository.createProvisionalCustomer(tx, {
      name: displayFieldsFor(group.bookings).displayName,
      email: claimable && group.key.kind === "EMAIL" ? group.key.value : null,
      phoneE164: claimable && group.key.kind === "PHONE" ? group.key.value : null,
    });

    report.customersCreated += 1;
    if (!claimable) {
      report.customersWithoutChannel += 1;
    } else if (group.key.kind === "EMAIL") {
      report.customersClaimingEmail += 1;
    } else {
      report.customersClaimingPhone += 1;
    }

    const profile = await crmBackfillRepository.createMigrationProfile(tx, {
      customerId: customer.id,
      businessId,
      ...displayFieldsFor(group.bookings),
    });
    profileId = profile.id;
    report.profilesCreated += 1;
  }

  report.bookingsLinked += await crmBackfillRepository.linkBookings(tx, pendingIds, profileId);

  // Do zero, e a partir de TODAS as reservas do prontuário — inclusive as que
  // a escrita ao vivo da fase 2 pendurou ali antes desta execução.
  const all = await crmBackfillRepository.listBookingsOfProfile(tx, profileId);
  const aggregate = aggregateFromBookings(all);
  await crmBackfillRepository.writeAggregate(tx, profileId, aggregate);

  if (aggregate.spendIsEstimated) {
    report.profilesEstimatedSpend += 1;
  } else {
    report.profilesExactSpend += 1;
  }
}

interface BusinessWork {
  businessId: number;
  groups: BookingGroup[];
  unresolved: BackfillBooking[];
  alreadyLinked: number;
}

async function planBusiness(businessId: number): Promise<BusinessWork> {
  const all = await crmBackfillRepository.listBookingsForGrouping(businessId);
  const { groups, unresolved } = groupBookings(all);

  return {
    businessId,
    // Só grupo com reserva solta dá trabalho. Grupo inteiramente vinculado é
    // pulado sem nem recalcular agregado: é o que torna a reexecução barata e
    // o que faz a segunda passada reportar zero.
    groups: groups.filter((group) => pendingBookings(group).length > 0),
    // Uma reserva sem canal que JÁ tenha prontuário (vinculada ao vivo, com
    // dado de contato que o normalizador não reconhece) não está sem resolver:
    // ela já está resolvida.
    unresolved: unresolved.filter((booking) => booking.profileId === null),
    alreadyLinked: all.filter((booking) => booking.profileId !== null).length,
  };
}

export interface BackfillOptions {
  // Sem isto nada é gravado. O default é simular: esta é a única rotina do
  // sistema que altera linha histórica, então escrever tem que ser um ato
  // explícito.
  apply?: boolean;
  // Restringe a um negócio. Em produção, é assim que se roda a simulação sem
  // manter uma transação aberta sobre a base inteira.
  businessId?: number;
}

export async function runCrmBackfill(options: BackfillOptions = {}): Promise<BackfillReport> {
  const report = emptyReport();
  const businesses = await crmBackfillRepository.listBusinessIds(options.businessId);

  const work: BusinessWork[] = [];
  for (const business of businesses) {
    const planned = await planBusiness(business.id);
    work.push(planned);

    report.businesses += 1;
    report.bookingsAlreadyLinked += planned.alreadyLinked;
    report.bookingsUnresolved += planned.unresolved.length;
    report.groups += planned.groups.length;
    // Candidata = sem prontuário. As reservas já vinculadas que entraram no
    // grupo só para revelar o prontuário do contato não contam.
    report.bookingsCandidate += planned.groups.reduce(
      (total, group) => total + pendingBookings(group).length,
      planned.unresolved.length,
    );
  }

  if (options.apply) {
    // Uma transação por grupo: matar o processo aqui deixa cada grupo
    // concluído inteiro e nenhum pela metade.
    for (const business of work) {
      for (const group of business.groups) {
        await prisma.$transaction((tx) => processGroup(tx, business.businessId, group, report));
      }
    }
    return report;
  }

  // Simulação: mesma rotina, uma transação só, desfeita no fim. Precisa ser
  // uma transação única para que a reivindicação de canal entre negócios seja
  // simulada de verdade — em transações separadas e desfeitas, o segundo
  // negócio veria o canal livre e o relatório mentiria.
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const business of work) {
          for (const group of business.groups) {
            await processGroup(tx, business.businessId, group, report);
          }
        }
        throw new DryRunRollback();
      },
      // A simulação percorre a base inteira numa transação; o default de 5s do
      // Prisma não serve. Em produção, rodar por negócio (--business) em vez
      // de aumentar isto.
      { timeout: 120_000 },
    );
  } catch (error: unknown) {
    if (!(error instanceof DryRunRollback)) throw error;
  }

  return report;
}
