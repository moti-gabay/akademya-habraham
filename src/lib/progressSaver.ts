// Decides when the learner's position is sent. The heartbeat, pause, the end of the
// video and leaving the page all go through it, so the same position is never sent
// twice and a save that failed is sent again on the next chance.

export type SaveResult = "ok" | "failed" | "unauthorized";

type Options = {
  lessonId: string;
  // The stop point the server already has; sending it again would change nothing.
  startAt: number;
  // A normal request (fetch with keepalive). May throw on a network error.
  post: (body: string) => Promise<SaveResult>;
  // For a page that is going away (navigator.sendBeacon): true when the browser queued it.
  beacon: (body: string) => boolean;
};

const key = (positionSec: number, ended: boolean) => `${positionSec}:${ended}`;

export function createProgressSaver({ lessonId, startAt, post, beacon }: Options) {
  // Set when a request is dispatched, not when it returns: that is the in-flight guard,
  // so two triggers at the same moment send once.
  let lastSent: string | null = startAt >= 1 ? key(Math.floor(startAt), false) : null;
  // After a 401 nothing is sent until a fresh playback address proves the session again.
  let stopped = false;

  function next(position: number | null, ended: boolean) {
    if (stopped || position === null) return null;
    const positionSec = Math.floor(position);
    // Opening a lesson, or a reload of the video, must not replace a good stop point.
    if (positionSec < 1) return null;
    const sent = key(positionSec, ended);
    if (sent === lastSent) return null;
    return { sent, body: JSON.stringify(ended ? { lessonId, positionSec, ended } : { lessonId, positionSec }) };
  }

  async function send({ sent, body }: { sent: string; body: string }) {
    const previous = lastSent;
    lastSent = sent;
    let result: SaveResult;
    try {
      result = await post(body);
    } catch {
      result = "failed";
    }
    if (result === "unauthorized") stopped = true;
    // Roll back, unless a newer position was sent meanwhile.
    else if (result === "failed" && lastSent === sent) lastSent = previous;
  }

  return {
    // Heartbeat, pause, end of the video, the Back button.
    save(position: number | null, ended = false): Promise<void> {
      const request = next(position, ended);
      return request ? send(request) : Promise.resolve();
    },
    // The page is hidden or closed, or the player is leaving the page.
    leave(position: number | null): void {
      const request = next(position, false);
      if (!request) return;
      if (beacon(request.body)) lastSent = request.sent;
      else void send(request);
    },
    // A new playback address was issued, so the session is valid again.
    resume(): void {
      stopped = false;
    },
  };
}
