import { test } from "node:test";
import assert from "node:assert/strict";
import { validateManifest } from "../src/manifest";
import { normalizeQuota } from "../src/rules";
const clip = () => ({
  fps: 12,
  loop: true,
  frames: [{ file: "idle/0.png", durationMs: 80 }],
});
const manifest = () => ({
  width: 384,
  height: 448,
  animations: {
    idle: clip(),
    "run-left": clip(),
    laugh: clip(),
    glance: clip(),
  },
  bridges: { bad: { frames: [] } },
});
test("manifest rejects unsafe paths and missing core frames; invalid bridges skipped", () => {
  assert.deepEqual(validateManifest(manifest()).bridges, {});
  const m = manifest();
  m.animations.idle.frames[0].file = "../outside.png";
  assert.throws(() => validateManifest(m));
  assert.throws(() => validateManifest(null));
});
test("malformed quota values remain unknown", () => {
  const [w] = normalizeQuota({
    rateLimits: {
      primary: { usedPercent: NaN, resetsAt: Infinity, windowDurationMins: -5 },
    },
  });
  assert.equal(w.remaining, null);
  assert.equal(w.resetsAt, null);
  assert.equal(w.durationMins, null);
  assert.deepEqual(normalizeQuota({ rateLimitsByLimitId: ["bad"] }), []);
});
