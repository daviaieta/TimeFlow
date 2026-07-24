export interface Service {
  id: number;
  name: string;
  duration: number;
  price: string; // Prisma Decimal serializa como string no JSON
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

export interface Availability {
  id: number;
  date: string; // ISO string vinda da API
  startTime: string;
  endTime: string;
  isBooked: boolean;
}
