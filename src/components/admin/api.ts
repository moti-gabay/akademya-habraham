// Calls the admin catalog API from the admin screens.
export type ApiFailure = { ok: false; error: string; field?: string; fields?: string[]; count?: number };
export type ApiResult = { ok: true; id?: string } | ApiFailure;

export async function callCatalog(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(`/api/admin/catalog/${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, id: data.id } : { ok: false, error: data.error ?? "generic", ...data };
  } catch {
    return { ok: false, error: "generic" };
  }
}
