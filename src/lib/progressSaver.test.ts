// pnpm test:unit — when the player sends the learner's position.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgressSaver, type SaveResult } from "./progressSaver";

// A saver whose requests are recorded, and whose results the test decides.
function setup({ startAt = 0, beaconWorks = true } = {}) {
  const posts: { body: unknown; settle: (result: SaveResult | Error) => void }[] = [];
  const beacons: unknown[] = [];
  const saver = createProgressSaver({
    lessonId: "lesson-1",
    startAt,
    post: (body) =>
      new Promise((resolve, reject) => {
        posts.push({ body: JSON.parse(body), settle: (result) => (result instanceof Error ? reject(result) : resolve(result)) });
      }),
    beacon: (body) => {
      beacons.push(JSON.parse(body));
      return beaconWorks;
    },
  });
  // Settles the latest request and lets the saver see the result.
  const settle = async (result: SaveResult | Error, index = posts.length - 1) => {
    posts[index].settle(result);
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { saver, posts, beacons, settle };
}

test("nothing is sent below one second, without a position, or at the stop point the server has", () => {
  const { saver, posts, beacons } = setup({ startAt: 760 });
  saver.save(0.4);
  saver.save(null);
  saver.save(760.9);
  saver.leave(null);
  saver.leave(760);
  assert.equal(posts.length + beacons.length, 0);
});

test("two triggers at the same position at the same moment send once", async () => {
  const { saver, posts, beacons, settle } = setup();
  saver.save(42.2);
  saver.save(42.7);
  saver.leave(42);
  assert.deepEqual(posts.map((post) => post.body), [{ lessonId: "lesson-1", positionSec: 42 }]);
  assert.equal(beacons.length, 0);
  await settle("ok");
  saver.leave(42);
  assert.equal(beacons.length, 0);
});

test("a failed heartbeat is rolled back, so leaving at the same position still sends", async () => {
  const { saver, posts, beacons, settle } = setup();
  saver.save(30);
  await settle("failed");
  saver.leave(30);
  assert.deepEqual(beacons, [{ lessonId: "lesson-1", positionSec: 30 }]);

  // A network error counts as a failure too.
  saver.save(45);
  await settle(new Error("offline"));
  saver.save(45);
  assert.equal(posts.length, 3);
});

test("a failure does not roll back over a newer position sent meanwhile", async () => {
  const { saver, beacons, settle } = setup();
  saver.save(30);
  saver.save(45);
  await settle("failed", 0);
  saver.leave(45);
  assert.equal(beacons.length, 0);
});

test("the end of the video is sent even at the position just saved by pause, and only once", async () => {
  const { saver, posts, settle } = setup();
  saver.save(60);
  saver.save(60, true);
  saver.save(60, true);
  assert.deepEqual(posts.map((post) => post.body), [
    { lessonId: "lesson-1", positionSec: 60 },
    { lessonId: "lesson-1", positionSec: 60, ended: true },
  ]);
  await settle("ok");
});

test("a 401 stops every save until a new playback address arrives", async () => {
  const { saver, posts, beacons, settle } = setup();
  saver.save(30);
  await settle("unauthorized");
  saver.save(60);
  saver.save(60, true);
  saver.leave(90);
  assert.equal(posts.length, 1);
  assert.equal(beacons.length, 0);

  saver.resume();
  saver.save(60);
  assert.equal(posts.length, 2);
});

test("a queued beacon counts as sent; a refused one falls back to a normal request", async () => {
  const queued = setup();
  queued.saver.leave(30);
  queued.saver.save(30);
  assert.deepEqual([queued.beacons.length, queued.posts.length], [1, 0]);

  const refused = setup({ beaconWorks: false });
  refused.saver.leave(30);
  assert.deepEqual(refused.posts.map((post) => post.body), [{ lessonId: "lesson-1", positionSec: 30 }]);
  await refused.settle("failed");
  refused.saver.leave(30);
  assert.equal(refused.posts.length, 2);
});
