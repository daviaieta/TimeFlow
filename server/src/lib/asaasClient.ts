import { env } from "../config/env";
import { AppError, BadRequestError } from "./errors";

interface AsaasCustomer {
  id: string;
}

interface AsaasSubscription {
  id: string;
}

interface AsaasPayment {
  invoiceUrl: string;
}

async function asaasFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${env.asaasApiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: env.asaasApiKey,
      "User-Agent": "TimeFlow",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();

    // 400 do Asaas normalmente é dado do cliente (CPF/CNPJ inválido) — vira
    // 400 pra quem chamou a nossa API, não 500/502 genérico.
    if (response.status === 400) {
      throw new BadRequestError(`Asaas rejected the request: ${body}`);
    }

    throw new AppError(`Asaas request failed (${response.status})`, 502);
  }

  return response.json() as Promise<T>;
}

export const asaasClient = {
  createCustomer(input: { name: string; email: string; cpfCnpj: string }): Promise<AsaasCustomer> {
    return asaasFetch<AsaasCustomer>("/customers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  // Corrige um cpfCnpj já cadastrado no Asaas (ex.: cliente digitou errado na
  // primeira tentativa e corrigiu num retry) — sem isso, nosso banco e o
  // customer real do Asaas ficam permanentemente divergentes, e a "correção"
  // não muda nada onde de fato importa (a fatura gerada pelo Asaas).
  updateCustomer(customerId: string, input: { cpfCnpj: string }): Promise<AsaasCustomer> {
    return asaasFetch<AsaasCustomer>(`/customers/${customerId}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  createSubscription(input: {
    customer: string;
    value: number;
    nextDueDate: string;
    description: string;
  }): Promise<AsaasSubscription> {
    return asaasFetch<AsaasSubscription>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: input.customer,
        billingType: "UNDEFINED",
        value: input.value,
        nextDueDate: input.nextDueDate,
        cycle: "MONTHLY",
        description: input.description,
      }),
    });
  },

  async getFirstSubscriptionPayment(subscriptionId: string): Promise<AsaasPayment | null> {
    const result = await asaasFetch<{ data: AsaasPayment[] }>(
      `/subscriptions/${subscriptionId}/payments`,
      { method: "GET" },
    );

    return result.data[0] ?? null;
  },
};
