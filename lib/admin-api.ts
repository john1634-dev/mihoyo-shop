import { getAccessToken } from "@/lib/auth";

export async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const authHeaders = await getAdminAuthHeaders();

  return fetch(input, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
  });
}
