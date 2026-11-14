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
    throw new Error(data.error || "The account request failed.");
  return data;
}
