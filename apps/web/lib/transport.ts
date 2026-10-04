export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const e = await response
      .json()
      .catch(() => ({ detail: "Сервис временно недоступен" }));
    throw new ApiError(
      typeof e.detail === "string"
        ? e.detail
        : Array.isArray(e.detail)
          ? e.detail.map((x: { msg: string }) => x.msg).join("; ")
          : "Ошибка запроса",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
