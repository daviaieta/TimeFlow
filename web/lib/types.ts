export interface Service {
  id: number;
  name: string;
  duration: number;
  price: string; // Prisma Decimal serializa como string no JSON
  // O outro lado do N:N. Serviço com a lista vazia não pode ser reservado por
  // ninguém — é o que a tela de serviços precisa mostrar.
  employees: EmployeeServiceLink[];
}

export interface EmployeeServiceLink {
  id: number;
  name: string;
}

export interface Employee {
  id: number;
  name: string;
  email: string;
  pendingInvite: boolean;
  avatarUrl: string | null;
  services: EmployeeServiceLink[];
}

export interface BookingSummary {
  id: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  service: EmployeeServiceLink;
  // O prontuário do CRM, quando a reserva tem um. Null com o CRM desligado e
  // nas reservas antigas que o backfill não conseguiu resolver — a agenda
  // trata os dois casos igual: mostra a reserva, sem link.
  //
  // clientName acima é o que foi digitado no ato; displayName é o cadastro,
  // que pode ter sido corrigido depois. Mostrar os dois quando divergem evita
  // a pergunta "esse é o mesmo cliente?".
  profile: { publicId: string; displayName: string } | null;
}

export interface Availability {
  id: number;
  date: string; // ISO string vinda da API
  startTime: string;
  endTime: string;
  isBooked: boolean;
  // Uma reserva mais longa que o slot ocupa vários slots seguidos, todos
  // apontando para o mesmo booking.id — é assim que a timeline junta os dois
  // slots de 30min de um corte de 1h num evento só.
  booking: BookingSummary | null;
}

export type ContactStatus = "NEW" | "READ" | "ARCHIVED";

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  teamSize: string | null;
  message: string;
  status: ContactStatus;
  createdAt: string; // ISO string vinda da API
}

// -----------------------------------------------------------------------------
// CRM (fase 4)
// -----------------------------------------------------------------------------

export type CustomerStatus = "ACTIVE" | "BLOCKED";

export interface CustomerTag {
  id: number;
  name: string;
  color: string | null;
  createdAt: string;
}

// O que a API devolve por prontuário. `publicId` é o handle: o id interno do
// cliente nunca sai do servidor, então é ele que vai na URL do painel.
export interface CustomerProfile {
  publicId: string;
  displayName: string;
  displayPhone: string | null;
  displayEmail: string | null;
  status: CustomerStatus;
  bookingsCount: number;
  totalSpent: string; // Decimal serializado como string
  // Verdadeiro quando alguma reserva somada é anterior ao snapshot de preço:
  // o número é uma estimativa e a tela precisa dizer isso.
  spendIsEstimated: boolean;
  loyaltyPoints: number;
  firstBookedAt: string | null;
  lastBookedAt: string | null;
  createdAt: string;
  tags: Pick<CustomerTag, "id" | "name" | "color">[];
}

export interface CustomerNote {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: number; name: string } | null;
}

export interface CustomerBooking {
  id: number;
  createdAt: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  serviceName: string | null;
  employeeName: string | null;
  priceAtBooking: string | null;
}

export type LoyaltyKind = "EARN" | "REDEEM" | "ADJUST" | "EXPIRE";

export interface LoyaltyEntry {
  id: number;
  kind: LoyaltyKind;
  points: number;
  reason: string | null;
  createdAt: string;
  author: { id: number; name: string } | null;
}

export interface CrmSettings {
  loyaltyEnabled: boolean;
  pointsPerUnit: number;
  pointsExpireAfterDays: number | null;
  customerLoginEnabled: boolean;
}

export interface CrmMetrics {
  total: number;
  active: number;
  blocked: number;
  newThisMonth: number;
  topSpenders: {
    publicId: string;
    displayName: string;
    bookingsCount: number;
    totalSpent: string;
  }[];
}
