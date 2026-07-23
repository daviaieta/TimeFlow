export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

interface ApiErrorBody {
  message?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      data.message ?? "Erro inesperado. Tente novamente.",
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: authHeaders(token),
  });

  return parseResponse<T>(response);
}
