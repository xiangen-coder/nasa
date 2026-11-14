export class AccountApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function accountApi(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/account${path}`, {
    method,
    cache: "no-store",
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new AccountApiError(data.error || "The account request failed.", response.status);
  return data;
}
