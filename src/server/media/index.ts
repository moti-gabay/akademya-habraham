import { createBunnyMediaProvider } from "./bunny";
import { createFakeFileStorage, createFakeMediaProvider, fakeMediaState } from "./fake";
import { createR2FileStorage } from "./r2";
import type { FileStorage, MediaProvider } from "./types";

// Single switch point for media, like repos/index.ts for data. The real services are
// opt-in: only MEDIA_PROVIDER=bunny and FILE_STORAGE=r2 select them, and keys on their
// own do not. Anything else uses the in-memory fakes, which need no account.
type Env = Record<string, string | undefined>;

export const mediaProviderName = (env: Env = process.env): "bunny" | "fake" => (env.MEDIA_PROVIDER === "bunny" ? "bunny" : "fake");
export const fileStorageName = (env: Env = process.env): "r2" | "fake" => (env.FILE_STORAGE === "r2" ? "r2" : "fake");

// The error names the variable and never shows a value.
function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getMediaProvider(env: Env = process.env): MediaProvider {
  if (mediaProviderName(env) === "fake") return createFakeMediaProvider(fakeMediaState);
  return createBunnyMediaProvider({
    libraryId: required(env, "BUNNY_LIBRARY_ID"),
    apiKey: required(env, "BUNNY_API_KEY"),
    pullZoneHost: required(env, "BUNNY_PULL_ZONE_HOST"),
  });
}

export function getFileStorage(env: Env = process.env): FileStorage {
  if (fileStorageName(env) === "fake") return createFakeFileStorage(fakeMediaState);
  return createR2FileStorage({
    accountId: required(env, "R2_ACCOUNT_ID"),
    accessKeyId: required(env, "R2_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "R2_SECRET_ACCESS_KEY"),
    bucket: required(env, "R2_BUCKET"),
    publicUrl: required(env, "R2_PUBLIC_URL").replace(/\/+$/, ""),
  });
}
