"use client";

import { Captions, ChevronLeft, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { localeNames, type Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/time";
import { SegmentedRadio } from "./SegmentedRadio";
import { Timecode } from "./Timecode";
import { card, outlineBtn, primaryBtn } from "./ui";

const SPEEDS = [
  [0.75, "slow"],
  [1, "normal"],
  [1.25, "fast"],
] as const;
const HEARTBEAT_MS = 30_000;
// A playback address this close to expiry is renewed before playing on.
const RENEW_BEFORE_MS = 5 * 60_000;

function showSubtitles(video: HTMLVideoElement, language: string) {
  for (const track of video.textTracks) {
    track.mode = track.language === language ? "showing" : "disabled";
  }
}

// The video address comes from /api/play and is never in the page itself.
type Playback = { url: string; expiresAt: number };
type PlayError = "signed_out" | "members_only" | "video_not_ready" | "failed";

async function requestPlayback(lessonId: string): Promise<Playback | PlayError> {
  try {
    const response = await fetch("/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId }),
    });
    if (response.ok) {
      const { url, expiresAt } = (await response.json()) as { url: string; expiresAt: string };
      return { url, expiresAt: Date.parse(expiresAt) };
    }
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 401) return "signed_out";
    if (error === "members_only" || error === "video_not_ready") return error;
    return "failed";
  } catch {
    return "failed";
  }
}

type Props = {
  lessonId: string;
  subtitles: { locale: Locale; url: string }[];
  startAt: number;
  // "off" when the lesson has no captions in the visitor's language.
  defaultSubtitle: Locale | "off";
  // With Clerk a visitor can sign in again; without it everyone is already the sample user.
  mode: "clerk" | "stub";
  // Lesson meta and title, shown between the video and the controls.
  children: React.ReactNode;
};

export function Player({ lessonId, subtitles, startAt, defaultSubtitle, mode, children }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState<PlayError | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(startAt);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [subtitle, setSubtitle] = useState<string>(defaultSubtitle);
  // Where to continue after the address is renewed, and whether to play on by itself.
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  // One quiet renewal per address; a second failure is shown.
  const renewed = useRef(false);
  const loading = !playback && !error;

  const apply = useCallback((result: Playback | PlayError) => {
    if (typeof result === "string") return setError(result);
    setError(null);
    setPlayback(result);
  }, []);
  const load = useCallback(() => requestPlayback(lessonId).then(apply), [lessonId, apply]);
  const retry = () => {
    setError(null);
    load();
  };

  useEffect(() => {
    requestPlayback(lessonId).then(apply);
  }, [lessonId, apply]);

  // Renew the address once, continuing from where the viewer was.
  const renew = useCallback(
    (play: boolean) => {
      if (renewed.current) return false;
      renewed.current = true;
      const video = videoRef.current;
      resume.current = { at: video?.currentTime ?? 0, play };
      setPlayback(null);
      load();
      return true;
    },
    [load],
  );

  // Native HLS where the browser has it (iOS), hls.js everywhere else.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playback.url;
      return () => video.removeAttribute("src");
    }
    let cancelled = false;
    let destroy = () => {};
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) return setError("failed");
      const hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        // An address that stopped working is renewed once; anything else is shown.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && renew(!video.paused)) return;
        setError("failed");
      });
      hls.loadSource(playback.url);
      hls.attachMedia(video);
      destroy = () => hls.destroy();
    });
    return () => {
      cancelled = true;
      destroy();
    };
  }, [playback, renew]);

  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    // Nothing watched yet: opening a lesson must not replace the stop point or mark it as started.
    if (!video || !video.duration || video.currentTime < 1) return Promise.resolve();
    return fetch("/api/telemetry/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId, positionSec: Math.floor(video.currentTime) }),
      keepalive: true,
    }).catch(() => {});
  }, [lessonId]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(saveProgress, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [playing, saveProgress]);

  useEffect(() => {
    window.addEventListener("pagehide", saveProgress);
    return () => window.removeEventListener("pagehide", saveProgress);
  }, [saveProgress]);

  useEffect(() => {
    showSubtitles(videoRef.current!, subtitle);
  }, [subtitle]);

  const seek = (seconds: number) => {
    const video = videoRef.current!;
    video.currentTime = Math.min(Math.max(0, seconds), video.duration || 0);
    setCurrent(video.currentTime);
  };
  const toggle = () => {
    const video = videoRef.current!;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };
  const skipButton = "flex w-20 flex-col items-center gap-1 rounded-xl text-sm";
  const skipIcon = "grid size-12 place-items-center rounded-full border border-line bg-card";

  return (
    <>
      <button
        type="button"
        className="tap inline-flex items-center gap-1 px-3 font-medium"
        // Save first, so the home page already shows the new stop point.
        onClick={() => saveProgress().then(() => router.push("/"))}
      >
        <ChevronLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("common.back")}
      </button>

      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        aria-label={t("player.video")}
        aria-busy={loading}
        className="aspect-video w-full bg-black lg:rounded-card"
        onClick={toggle}
        onPlay={(event) => {
          // About to expire: renew first, then play on from here.
          if (playback && playback.expiresAt - Date.now() < RENEW_BEFORE_MS && !renewed.current) {
            event.currentTarget.pause();
            renew(true);
            return;
          }
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
          saveProgress();
        }}
        onError={() => {
          // Native HLS reports a dead address here.
          if (!renew(playing)) setError("failed");
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration);
          video.playbackRate = speed;
          renewed.current = false;
          const continueFrom = resume.current;
          resume.current = null;
          // A stop point at or past the end starts the lesson over.
          const resumeAt = continueFrom ? continueFrom.at : startAt < video.duration - 5 ? startAt : 0;
          video.currentTime = resumeAt;
          setCurrent(resumeAt);
          if (continueFrom?.play) video.play().catch(() => {});
        }}
      >
        {subtitles.map((track) => (
          <track key={track.locale} kind="subtitles" src={track.url} srcLang={track.locale} label={localeNames[track.locale]} />
        ))}
      </video>

      <div className="space-y-4 px-4 pt-3 lg:px-0">
        {children}
        {loading && (
          <p aria-live="polite" className="font-medium text-muted">
            {t("player.loading")}
          </p>
        )}
        {error && (
          <div role="alert" className="space-y-3 rounded-xl bg-cream p-4">
            <p className="font-medium">
              {error === "signed_out" && mode === "clerk"
                ? t("player.errors.signedOut")
                : error === "members_only"
                  ? t("player.errors.membersOnly")
                  : error === "video_not_ready"
                    ? t("player.errors.notReady")
                    : t("player.error")}
            </p>
            <div className="flex flex-wrap gap-3">
              {error === "signed_out" && mode === "clerk" && (
                <Link href="/sign-in" className={primaryBtn}>
                  {t("player.signIn")}
                </Link>
              )}
              <button type="button" className={error === "signed_out" && mode === "clerk" ? outlineBtn : primaryBtn} onClick={retry}>
                {t("player.retry")}
              </button>
            </div>
          </div>
        )}

        <div>
          <input
            type="range"
            className="player-range"
            min={0}
            max={Math.floor(duration)}
            step={5}
            value={Math.floor(current)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label={t("player.timeline")}
            aria-valuetext={t("player.timelineValue", { current: formatTime(current), total: formatTime(duration) })}
            style={{ "--fill": `${duration ? (current / duration) * 100 : 0}%` } as React.CSSProperties}
          />
          <div className="flex justify-between text-sm text-muted">
            <Timecode seconds={current} />
            <Timecode seconds={duration} />
          </div>
        </div>

        <div className="flex items-start justify-center gap-4">
          <button type="button" className={skipButton} onClick={() => seek(current - 10)}>
            <span className={skipIcon}>
              <RotateCcw aria-hidden className="size-5 rtl:-scale-x-100" />
            </span>
            {t("player.back10")}
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={t(playing ? "player.pause" : "player.play")}
            className="grid size-16 place-items-center rounded-full bg-green text-white hover:bg-green-dark"
          >
            {playing ? <Pause aria-hidden className="size-7 fill-current" /> : <Play aria-hidden className="size-7 fill-current" />}
          </button>
          <button type="button" className={skipButton} onClick={() => seek(current + 10)}>
            <span className={skipIcon}>
              <RotateCw aria-hidden className="size-5 rtl:-scale-x-100" />
            </span>
            {t("player.forward10")}
          </button>
        </div>

        <SegmentedRadio
          legend={t("player.speed")}
          name="speed"
          value={speed}
          onChange={(value) => {
            setSpeed(value);
            videoRef.current!.playbackRate = value;
          }}
          options={SPEEDS.map(([value, key]) => ({ value, label: t(`player.speeds.${key}`) }))}
        />

        <div className={`${card} flex items-center gap-2 px-4`}>
          <Captions aria-hidden className="size-5" />
          <label htmlFor="subtitles" className="font-medium">
            {t("player.subtitles")}
          </label>
          <select
            id="subtitles"
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            className="tap ms-auto cursor-pointer rounded-lg bg-transparent font-medium text-green"
          >
            {subtitles.map((track) => (
              <option key={track.locale} value={track.locale}>
                {localeNames[track.locale]}
              </option>
            ))}
            <option value="off">{t("player.subtitlesOff")}</option>
          </select>
        </div>
      </div>
    </>
  );
}
