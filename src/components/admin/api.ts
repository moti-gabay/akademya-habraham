// Calls the admin API from the admin screens.
export type ApiFailure = { ok: false; error: string; field?: string; fields?: string[]; count?: number };
export type ApiResult<Data = { id?: string }> = ({ ok: true } & Data) | ApiFailure;

// `path` is under /api/admin/. A File is sent as it is; anything else as JSON.
export async function callAdmin<Data = { id?: string }>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<Data>> {
  try {
    const file = body instanceof Blob;
    const response = await fetch(`/api/admin/${path}`, {
      method,
      headers: body === undefined || file ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : file ? body : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, ...data } : { ok: false, error: data.error ?? "generic", ...data };
  } catch {
    return { ok: false, error: "generic" };
  }
}

export const callCatalog = (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
  callAdmin(method, `catalog/${path}`, body);
