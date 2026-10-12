import { formatTime } from "@/lib/time";

// Timecodes read left to right in every locale.
export function Timecode({ seconds }: { seconds: number }) {
  return <span className="ltr-isolate inline-block tabular-nums">{formatTime(seconds)}</span>;
}
