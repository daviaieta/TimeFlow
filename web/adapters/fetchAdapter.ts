import { getToken } from "@/lib/auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface FetchAdapterInput {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface FetchAdapterResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

export const fetchAdapter = async <T = unknown>({
  method,
  path,
  body,
  headers,
}: FetchAdapterInput): Promise<FetchAdapterResponse<T>> => {
  const token = typeof window === "undefined" ? null : getToken();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as T;

  if (!res.ok) {
    const message =
      (data as { message?: string }).message ??
      "Erro inesperado. Tente novamente.";
    throw new ApiError(message, res.status);
  }

  return { data, status: res.status, statusText: res.statusText };
};
