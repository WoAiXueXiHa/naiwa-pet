import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuota,
  thresholdAlerts,
  quotaHours,
  breakDue,
  clampPosition,
  sanitizeSettings,
  freeDragPosition,
  dragFacing,
} from "../src/rules";
const at = (t: string) => new Date("2026-10-26T" + t + "+08:00").getTime();
test("Beijing schedules include exclusions and quota boundaries", () => {
  assert.equal(quotaHours(at("09:00:00")), true);
  assert.equal(quotaHours(at("23:00:00")), false);
  for (const h of ["12", "13", "18", "19"])
    assert.equal(breakDue(at(h + ":00:00")), false);
  assert.equal(breakDue(at("22:00:00")), true);
  assert.equal(breakDue(at("11:01:00")), false);
});
test("quota normalizes multiple buckets, missing fields and clamps", () => {
  const w = normalizeQuota({
    rateLimitsByLimitId: {
      codex: {
        primary: { usedPercent: 115, resetsAt: 10 },
        secondary: { usedPercent: NaN },
      },
      other: { primary: { usedPercent: 10 } },
    },
  });
  assert.equal(w.length, 3);
  assert.equal(w[0].remaining, 0);
  assert.equal(w[0].resetsAt, 10000);
  assert.equal(w[1].remaining, null);
  assert.equal(w[2].remaining, 90);
  assert.equal(
    normalizeQuota({ rateLimits: { primary: { usedPercent: 23 } } })[0]
      .remaining,
    77,
  );
});
test("crossed thresholds merge, survive serialized state, reset and account change", () => {
  let seen = {};
  const w = normalizeQuota({
    rateLimits: { primary: { usedPercent: 96, resetsAt: 100 } },
  });
  assert.equal(thresholdAlerts("a", w, seen)[0].threshold, 5);
  seen = JSON.parse(JSON.stringify(seen));
  assert.equal(thresholdAlerts("a", w, seen).length, 0);
  assert.equal(thresholdAlerts("b", w, seen).length, 1);
  w[0].resetsAt = 200000;
  assert.equal(thresholdAlerts("a", w, seen).length, 1);
});
test("falling through thresholds notifies each once", () => {
  const seen = {};
  const w = normalizeQuota({
    rateLimits: { primary: { usedPercent: 80, resetsAt: 100 } },
  });
  assert.equal(thresholdAlerts("a", w, seen)[0].threshold, 20);
  w[0].remaining = 9;
  assert.equal(thresholdAlerts("a", w, seen)[0].threshold, 10);
  assert.equal(thresholdAlerts("a", w, seen).length, 0);
});
test("invalid or unknown reset never fabricates dedup cycle", () => {
  assert.deepEqual(
    thresholdAlerts(
      "a",
      [
        {
          key: "a",
          name: "a",
          remaining: 5,
          durationMins: null,
          resetsAt: null,
        },
      ],
      {},
    ),
    [],
  );
});
test("settings and bounds stay within valid limits", () => {
  assert.deepEqual(
    sanitizeSettings({ size: 900, sound: true, x: 999, volume: -1 }),
    { size: 360, sound: true, volume: 0 },
  );
  assert.deepEqual(
    clampPosition(-500, 1000, 420, 340, {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    }),
    { x: 0, y: 740 },
  );
});
test("free dragging supports all eight compass directions and negative monitor coordinates", () => {
  const base = { x: -500, y: 900 },
    origin = { x: 100, y: 100 };
  for (const [dx, dy] of [
    [0, -150],
    [150, -150],
    [150, 0],
    [150, 150],
    [0, 150],
    [-150, 150],
    [-150, 0],
    [-150, -150],
  ]) {
    assert.deepEqual(
      freeDragPosition(base, origin, { x: 100 + dx, y: 100 + dy }),
      { x: base.x + dx, y: base.y + dy },
    );
  }
  assert.equal(dragFacing(0, 100, "run-left"), "run-left");
  assert.equal(dragFacing(0, -100, "run-right"), "run-right");
  assert.equal(dragFacing(-20, 10, "run-right"), "run-left");
});
test("tiny display sizes and live scale values are accepted", () => {
  assert.deepEqual(sanitizeSettings({ size: 80 }), { size: 80 });
  assert.deepEqual(sanitizeSettings({ size: 1 }), { size: 40 });
  assert.deepEqual(sanitizeSettings({ size: 120 }), { size: 120 });
});
