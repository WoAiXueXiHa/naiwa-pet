import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState, saveState } from "../src/storage";
import { redact, maskAccount } from "../src/privacy";
test("corrupt settings preserved; invalid fields rejected; atomic roundtrip", () => {
  const dir = mkdtempSync(join(tmpdir(), "naiwa-"));
  try {
    const file = join(dir, "settings.json");
    writeFileSync(file, "{broken");
    assert.equal(loadState(file).settings.size, 80);
    assert.ok(readdirSync(dir).some((f) => f.includes(".corrupt-")));
    writeFileSync(
      file,
      JSON.stringify({
        settings: { size: 999, x: "invalid", pausedUntil: -1 },
        seen: { x: true, y: "yes" },
      }),
    );
    const state = loadState(file);
    assert.equal(state.settings.size, 360);
    assert.equal(state.settings.x, undefined);
    assert.deepEqual(state.seen, { x: true });
    saveState(file, state);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
      ...state,
      windowLayoutVersion: 2,
    });
    assert.deepEqual(loadState(file), state);
    assert.throws(() =>
      saveState(join(dir, "missing", "settings.json"), state),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("diagnostics hide personal identifiers", () => {
  assert.equal(maskAccount("person@example.org"), "p***@***");
  const value = redact(String.raw`person@example.org C:\Users\private\file`);
  assert.ok(!value.includes("example.org"));
  assert.ok(!value.includes("private"));
});

test("bubble space migration preserves pet position and is only applied once", () => {
  const dir = mkdtempSync(join(tmpdir(), "naiwa-layout-"));
  try {
    const file = join(dir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({ settings: { size: 80, x: 100, y: 200 } }),
    );
    const state = loadState(file);
    assert.equal(state.settings.x, 45);
    assert.equal(state.settings.y, 28);
    saveState(file, state);
    assert.deepEqual(loadState(file), state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
