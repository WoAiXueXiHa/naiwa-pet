import { test } from "node:test";
import assert from "node:assert/strict";
import { spriteVisible, resizedBounds } from "../src/windows";
import { Scheduler } from "../src/scheduler";
test("resizing preserves foot and center; negative monitor positions remain visible", () => {
  const old = { x: -200, y: 100, width: 150, height: 180 };
  const next = resizedBounds(old, 120);
  assert.ok(Math.abs(next.x + next.width / 2 - (old.x + old.width / 2)) <= 0.5);
  assert.equal(next.y + next.height, old.y + old.height);
  assert.equal(
    spriteVisible(old, 80, [{ x: -1920, y: 0, width: 1920, height: 1080 }]),
    true,
  );
  assert.equal(
    spriteVisible(old, 80, [{ x: 0, y: 0, width: 1920, height: 1080 }]),
    false,
  );
});
test("scheduler start is idempotent and stop clears future ticks", async () => {
  let ticks = 0;
  const scheduler = new Scheduler(() => ticks++, 5);
  scheduler.start();
  scheduler.start();
  await new Promise((r) => setTimeout(r, 25));
  scheduler.stop();
  const count = ticks;
  await new Promise((r) => setTimeout(r, 15));
  assert.ok(count > 0);
  assert.equal(ticks, count);
});
