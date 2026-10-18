"use client";

import { Captions, ChevronLeft, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { localeNames, type Locale } from "@/i18n/routing";
import { formatTime } from "@/lib/time";
import { SegmentedRadio } from "./SegmentedRadio";
import { Timecode } from "./Timecode";
import { card } from "./ui";

const SPEEDS = [
  [0.75, "slow"],
  [1, "normal"],
  [1.25, "fast"],
] as const;
const HEARTBEAT_MS = 30_000;

function showSubtitles(video: HTMLVideoElement, language: string) {
  for (const track of video.textTracks) {
    track.mode = track.language === language ? "showing" : "disabled";
  }
}

type Props = {
  lessonId: string;
  src: string;
  subtitles: { locale: Locale; url: string }[];
  startAt: number;
  // "off" when the lesson has no captions in the visitor's language.
  defaultSubtitle: Locale | "off";
  // Lesson meta and title, shown between the video and the controls.
  children: React.ReactNode;
};

export function Player({ lessonId, src, subtitles, startAt, defaultSubtitle, children }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(startAt);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [subtitle, setSubtitle] = useState<string>(defaultSubtitle);
  const [failed, setFailed] = useState(false);

  // Native HLS where the browser has it (iOS), hls.js everywhere else.
  useEffect(() => {
    const video = videoRef.current!;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }
    let cancelled = false;
    let destroy = () => {};
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) return setFailed(true);
      const hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, data) => data.fatal && setFailed(true));
      hls.loadSource(src);
      hls.attachMedia(video);
      destroy = () => hls.destroy();
    });
    return () => {
      cancelled = true;
      destroy();
    };
  }, [src]);

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
        className="aspect-video w-full bg-black lg:rounded-card"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          saveProgress();
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(video.duration);
          video.playbackRate = speed;
          // A stop point at or past the end starts the lesson over.
          const resumeAt = startAt < video.duration - 5 ? startAt : 0;
          video.currentTime = resumeAt;
          setCurrent(resumeAt);
        }}
      >
        {subtitles.map((track) => (
          <track key={track.locale} kind="subtitles" src={track.url} srcLang={track.locale} label={localeNames[track.locale]} />
        ))}
      </video>

      <div className="space-y-4 px-4 pt-3 lg:px-0">
        {children}
        {failed && (
          <p role="alert" className="rounded-xl bg-cream p-3 font-medium">
            {t("player.error")}
          </p>
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
