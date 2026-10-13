import { fileStorageName, getFileStorage, getMediaProvider, mediaProviderName } from "@/server/media";
import { createFakeMediaProvider, fakeMediaState } from "@/server/media/fake";
import type { MediaDeps } from "@/server/media/service";
import { mediaRepo } from "@/server/repos";

// What the media service works with in this deployment.
export const mediaDeps = (): MediaDeps => ({ repo: mediaRepo, provider: getMediaProvider(), storage: getFileStorage() });

// True when no real media service is configured. The fake's own routes (/api/dev/media)
// exist only then, and never on Vercel.
type Env = Record<string, string | undefined>;
export const fakeMediaActive = (env: Env = process.env) => mediaProviderName(env) === "fake" && fileStorageName(env) === "fake";
export const fakeRoutesEnabled = (env: Env = process.env) => fakeMediaActive(env) && !env.VERCEL;
export const fakeProvider = () => createFakeMediaProvider(fakeMediaState);
