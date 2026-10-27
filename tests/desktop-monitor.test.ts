import { test } from "node:test";
import assert from "node:assert/strict";
import { DesktopMonitor } from "../src/desktop-monitor";
test("desktop lifecycle emits only real transitions and preserves state on probe errors", async () => {
  let value = "",
    fail = false;
  const events: string[] = [];
  const monitor = new DesktopMonitor(async () => {
    if (fail) throw new Error("transient");
    return value;
  });
  monitor.on("change", (s) => events.push(s));
  await monitor.check();
  value = "client:1";
  await monitor.check();
  await monitor.check();
  fail = true;
  await monitor.check();
  assert.equal(monitor.session, "client:1");
  fail = false;
  value = "";
  await monitor.check();
  value = "client:2";
  await monitor.check();
  assert.deepEqual(events, ["", "client:1", "", "client:2"]);
  monitor.stop();
});
test("stopped monitor ignores late process-enumeration result", async () => {
  let finish!: (value: string) => void;
  const monitor = new DesktopMonitor(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = monitor.check();
  monitor.stop();
  finish("late-client");
  await pending;
  assert.equal(monitor.session, null);
});
