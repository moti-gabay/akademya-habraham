import { createHash } from "node:crypto";
import type { MediaProvider, VideoStatus } from "./types";

export type BunnyConfig = {
  libraryId: string;
  apiKey: string;
  // CDN host of the library's pull zone, e.g. "vz-xxxx.b-cdn.net".
  pullZoneHost: string;
};

const API = "https://video.bunnycdn.com";
const TUS_ENDPOINT = `${API}/tusupload`;
const UPLOAD_EXPIRES_SEC = 60 * 60;

// Bunny's video status codes: 0 created, 1 uploaded, 2 processing, 3 transcoding,
// 4 finished, 5 error, 6 upload failed. Anything newer is treated as still processing.
function toStatus(code: unknown): VideoStatus {
  if (code === 0) return "created";
  if (code === 4) return "ready";
  if (code === 5 || code === 6) return "error";
  return "processing";
}

// Bunny Stream over its HTTP API. The API key stays on the server: the browser gets a
// signature that is valid for one video and one hour.
export function createBunnyMediaProvider(
  config: BunnyConfig,
  fetchFn: typeof fetch = fetch,
  now = () => Date.now(),
): MediaProvider {
  const videos = `${API}/library/${config.libraryId}/videos`;
  // Errors carry the operation and status only, never the response or the key.
  async function call(operation: string, url: string, init: RequestInit = {}, allowMissing = false) {
    const response = await fetchFn(url, {
      ...init,
      headers: { AccessKey: config.apiKey, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    if (!response.ok && !(allowMissing && response.status === 404)) {
      throw new Error(`Video provider ${operation} failed: ${response.status}`);
    }
    return response;
  }

  return {
    async createVideo(title) {
      const response = await call("create", videos, { method: "POST", body: JSON.stringify({ title }) });
      const { guid } = (await response.json()) as { guid: string };
      return { videoId: guid, libraryId: config.libraryId };
    },
    async createUpload(videoId) {
      const expires = Math.floor(now() / 1000) + UPLOAD_EXPIRES_SEC;
      const signature = createHash("sha256").update(`${config.libraryId}${config.apiKey}${expires}${videoId}`).digest("hex");
      return {
        protocol: "tus",
        endpoint: TUS_ENDPOINT,
        headers: {
          AuthorizationSignature: signature,
          AuthorizationExpire: String(expires),
          VideoId: videoId,
          LibraryId: config.libraryId,
        },
      };
    },
    async getVideo(videoId) {
      const response = await call("status", `${videos}/${videoId}`, {}, true);
      if (!response.ok) return null;
      const raw = (await response.json()) as { status?: number; length?: number; thumbnailFileName?: string };
      const status = toStatus(raw.status);
      return {
        status,
        durationSec: raw.length ? Math.round(raw.length) : null,
        thumbnailUrl:
          status === "ready" && raw.thumbnailFileName ? `https://${config.pullZoneHost}/${videoId}/${raw.thumbnailFileName}` : null,
        raw,
      };
    },
    async deleteVideo(videoId) {
      await call("delete", `${videos}/${videoId}`, { method: "DELETE" }, true);
    },
    async putCaption(videoId, locale, label, vtt) {
      await call("caption upload", `${videos}/${videoId}/captions/${locale}`, {
        method: "POST",
        body: JSON.stringify({ srclang: locale, label, captionsFile: Buffer.from(vtt, "utf8").toString("base64") }),
      });
    },
    async deleteCaption(videoId, locale) {
      await call("caption delete", `${videos}/${videoId}/captions/${locale}`, { method: "DELETE" }, true);
    },
  };
}
