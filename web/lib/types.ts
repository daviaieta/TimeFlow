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
  services: EmployeeServiceLink[];
}

export interface BookingSummary {
  id: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  service: EmployeeServiceLink;
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
