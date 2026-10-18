"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { localeNames, type Locale } from "@/i18n/routing";
import { LOCALES } from "@/server/i18n/locales";
import type { UploadTarget, VideoStatus } from "@/server/media/types";
import { ProgressBar } from "../ProgressBar";
import { card, outlineBtn } from "../ui";
import { callAdmin } from "./api";

// A lesson's media in the admin: the video and its processing status, a caption file per
// language, and the image. The video and the image go from the browser straight to
// where they are stored; this screen only asks the server where to send them.

const POLL_MS = 3000;
const small = `${outlineBtn} px-4 text-sm disabled:opacity-40`;

export type LessonMediaProps = {
  lessonId: string;
  video: { status: VideoStatus; durationSec: number | null } | null;
  captions: { locale: Locale; synced: boolean }[];
  // The image shown for the lesson, and whether it was uploaded (not the video's own).
  thumbnail: { url: string | null; uploaded: boolean };
};

// Sends a file where the server said, reporting progress as a percentage.
function sendFile(target: UploadTarget | { protocol: "put"; url: string; headers?: Record<string, string> }, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    if (target.protocol === "tus") {
      // Resumable upload, as the video provider expects it. Loaded only when needed.
      import("tus-js-client").then(({ Upload }) =>
        new Upload(file, {
          endpoint: target.endpoint,
          headers: target.headers,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          metadata: { filetype: file.type, title: file.name },
          onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
          onSuccess: () => resolve(),
          onError: reject,
        }).start(),
      );
      return;
    }
    const request = new XMLHttpRequest();
    request.open("PUT", target.url);
    for (const [name, value] of Object.entries(("headers" in target && target.headers) || {})) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.onload = () => (request.status < 300 ? resolve() : reject(new Error(String(request.status))));
    request.onerror = () => reject(new Error("network"));
    request.send(file);
  });
}

// A button that opens the file chooser. The real input is inside the label, so the
// label's text names it and the keyboard reaches it.
function FileButton({
  label,
  hidden,
  accept,
  disabled,
  onFile,
  className = small,
}: {
  label: string;
  // Extra words for screen readers, e.g. the language a caption is for.
  hidden?: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  className?: string;
}) {
  return (
    <label
      className={`${className} cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green ${disabled ? "pointer-events-none opacity-40" : ""}`}
    >
      {label}
      {hidden && <span className="sr-only">{hidden}</span>}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so choosing the same file again is noticed.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

export function LessonMediaPanel({ lessonId, video, captions, thumbnail }: LessonMediaProps) {
  const t = useTranslations("admin");
  const router = useRouter();
  const media = `media/lessons/${lessonId}`;
  const [failure, setFailure] = useState("");
  const [working, setWorking] = useState(false);
  // Percentage while a video file is on its way, else null.
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const explain = (error: string) => (t.has(`errors.${error}`) ? t(`errors.${error}`, { count: 0 }) : t("errors.generic"));
  // Runs one change and shows the page's new state, or why it was refused.
  async function run(change: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setWorking(true);
    const result = await change().catch(() => ({ ok: false as const, error: "generic" }));
    setWorking(false);
    setFailure(result.ok ? "" : explain(result.error));
    if (result.ok) router.refresh();
  }

  // While the provider is working on the video, ask how it is doing.
  const status = video?.status;
  const waiting = uploading === null && (status === "processing" || (uploaded && status === "created"));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const result = await callAdmin<{ media: { video: { status: VideoStatus } | null } }>("GET", `${media}/video`);
      if (result.ok && result.media.video?.status !== status) router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, status, media, router]);

  async function uploadVideo(file: File) {
    setFailure("");
    setUploading(0);
    const started = await callAdmin<{ upload: UploadTarget }>("POST", `${media}/video`);
    if (!started.ok) {
      setUploading(null);
      return setFailure(explain(started.error));
    }
    try {
      await sendFile(started.upload, file, setUploading);
      setUploaded(true);
      // Ask at once, so the screen moves on from "waiting for the file" without delay.
      await callAdmin("GET", `${media}/video`);
    } catch {
      setFailure(t("media.video.uploadFailed"));
    }
    setUploading(null);
    router.refresh();
  }

  const uploadThumbnail = (file: File) =>
    run(async () => {
      const started = await callAdmin<{ key: string; upload: { url: string; headers: Record<string, string> } }>("POST", `${media}/thumbnail`, {
        contentType: file.type,
      });
      if (!started.ok) return started;
      await sendFile({ protocol: "put", url: started.upload.url, headers: { "content-type": file.type, ...started.upload.headers } }, file, () => {});
      return callAdmin("PUT", `${media}/thumbnail`, { key: started.key });
    });

  const busy = working || uploading !== null;
  const videoText =
    uploading !== null
      ? t("media.video.uploading", { percent: uploading })
      : !video
        ? t("media.video.none")
        : video.status === "ready"
          ? t("media.video.ready", { minutes: Math.round((video.durationSec ?? 0) / 60) })
          : t(`media.video.${video.status === "uploading" ? "created" : video.status}`);

  return (
    <section className={`${card} grid gap-6 p-5`} aria-labelledby="media-title">
      <h2 id="media-title" className="text-lg font-medium">
        {t("media.title")}
      </h2>
      {failure && (
        <p role="alert" className="rounded-xl border-2 border-red-700 p-4 font-medium text-red-700">
          {failure}
        </p>
      )}

      <div className="grid gap-3">
        <h3 className="font-medium">{t("media.video.title")}</h3>
        <p role="status" className={video?.status === "error" ? "font-medium text-red-700" : video?.status === "ready" ? "font-medium text-green" : ""}>
          {videoText}
        </p>
        {uploading !== null && <ProgressBar value={uploading} max={100} label={t("media.video.progress")} />}
        <div className="flex flex-wrap gap-2">
          <FileButton label={t(video ? "media.video.replace" : "media.video.upload")} accept="video/*" disabled={busy} onFile={uploadVideo} className={`${outlineBtn} disabled:opacity-40`} />
          {video && (
            <button
              type="button"
              className={`${outlineBtn} disabled:opacity-40`}
              disabled={busy}
              onClick={() => window.confirm(t("media.video.confirmRemove")) && run(() => callAdmin("DELETE", `${media}/video`))}
            >
              {t("media.video.remove")}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <h3 className="font-medium">{t("media.captions.title")}</h3>
        <p className="text-sm text-muted">{t("media.captions.hint")}</p>
        <ul className="grid gap-2">
          {LOCALES.map((locale) => {
            const caption = captions.find((item) => item.locale === locale);
            const language = localeNames[locale];
            // Read out after a button's own text, so each one says which language it is for.
            const forLanguage = `: ${language}`;
            return (
              <li key={locale} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 ps-4">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="font-medium">{language}</span>
                  <span className="block text-sm text-muted">
                    {t(caption ? (caption.synced ? "media.captions.synced" : "media.captions.pending") : "media.captions.none")}
                  </span>
                </span>
                <FileButton
                  label={t(caption ? "media.captions.replace" : "media.captions.upload")}
                  hidden={forLanguage}
                  accept=".vtt,text/vtt"
                  disabled={busy}
                  onFile={(file) => run(() => callAdmin("PUT", `${media}/captions/${locale}`, file))}
                />
                {caption && !caption.synced && video?.status === "ready" && (
                  <button type="button" className={small} disabled={busy} onClick={() => run(() => callAdmin("POST", `${media}/captions/${locale}/sync`))}>
                    {t("media.captions.sync")}
                    <span className="sr-only">{forLanguage}</span>
                  </button>
                )}
                {caption && (
                  <button type="button" className={small} disabled={busy} onClick={() => run(() => callAdmin("DELETE", `${media}/captions/${locale}`))}>
                    {t("media.captions.remove")}
                    <span className="sr-only">{forLanguage}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-3">
        <h3 className="font-medium">{t("media.thumbnail.title")}</h3>
        <div className="flex flex-wrap items-center gap-4">
          {thumbnail.url && (
            // Decorative: the text next to it says which image this is.
            <div
              aria-hidden
              className="aspect-video w-48 rounded-xl bg-video bg-cover bg-center"
              style={{ backgroundImage: `url("${encodeURI(thumbnail.url)}")` }}
            />
          )}
          <p className="min-w-0 flex-1 basis-56">
            {t(thumbnail.url ? (thumbnail.uploaded ? "media.thumbnail.uploaded" : "media.thumbnail.fromVideo") : "media.thumbnail.none")}
            <span className="block text-sm text-muted">{t("media.thumbnail.hint")}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FileButton label={t("media.thumbnail.upload")} accept="image/jpeg,image/png,image/webp" disabled={busy} onFile={uploadThumbnail} className={`${outlineBtn} disabled:opacity-40`} />
          {thumbnail.uploaded && (
            <button type="button" className={`${outlineBtn} disabled:opacity-40`} disabled={busy} onClick={() => run(() => callAdmin("DELETE", `${media}/thumbnail`))}>
              {t("media.thumbnail.useVideo")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
