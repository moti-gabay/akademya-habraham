import { presignUrl, type Presign } from "./sigv4";
import type { FileStorage } from "./types";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

const UPLOAD_EXPIRES_SEC = 15 * 60;
const REQUEST_EXPIRES_SEC = 60;

// Cloudflare R2 through its S3-compatible API. Every request, the server's own
// included, is a presigned URL, so there is one signing path and no SDK.
export function createR2FileStorage(config: R2Config, fetchFn: typeof fetch = fetch, now = () => new Date()): FileStorage {
  const url = (method: Presign["method"], key: string, expiresSec: number) =>
    presignUrl({
      method,
      host: `${config.accountId}.r2.cloudflarestorage.com`,
      path: `/${config.bucket}/${key}`,
      region: "auto",
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      expiresSec,
      now: now(),
    });
  const request = async (method: Presign["method"], key: string, init: RequestInit = {}) => {
    const response = await fetchFn(url(method, key, REQUEST_EXPIRES_SEC), { ...init, method });
    if (!response.ok && response.status !== 404) throw new Error(`File storage ${method} failed: ${response.status}`);
    return response;
  };

  return {
    async presignUpload(key, contentType) {
      return { url: url("PUT", key, UPLOAD_EXPIRES_SEC), headers: { "content-type": contentType } };
    },
    async put(key, body, contentType) {
      const response = await request("PUT", key, { body: body as BodyInit, headers: { "content-type": contentType } });
      if (!response.ok) throw new Error(`File storage PUT failed: ${response.status}`);
    },
    async get(key) {
      const response = await request("GET", key);
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    async exists(key) {
      return (await request("HEAD", key)).ok;
    },
    async delete(key) {
      await request("DELETE", key);
    },
    // The bucket stays private: thumbnails are served by the app (/api/thumbnails).
    publicUrl: (key) => `/api/thumbnails/${key.split("/").map(encodeURIComponent).join("/")}`,
  };
}
