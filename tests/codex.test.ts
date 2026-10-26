import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { CodexClient } from "../src/codex";
function fake() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill() {
      child.emit("exit", 0);
      return true;
    },
  });
  return child;
}
test("concurrent initialization launches once; malformed protocol ignored; disconnect rejects pending", async () => {
  const child = fake();
  let launches = 0;
  child.stdin.on("data", (data) => {
    for (const line of String(data).trim().split("\n")) {
      const m = JSON.parse(line);
      if (m.method === "initialize")
        queueMicrotask(() =>
          child.stdout.write(JSON.stringify({ id: m.id, result: {} }) + "\n"),
        );
    }
  });
  const c = new CodexClient(() => {
    launches++;
    return child as unknown as ChildProcessWithoutNullStreams;
  }, 100);
  await Promise.all([c.start(), c.start()]);
  assert.equal(launches, 1);
  child.stdout.write("null\nnot-json\n");
  const pending = c.request("account/read");
  child.emit("exit", 1);
  await assert.rejects(pending);
  assert.equal(c.pending.size, 0);
  c.stop();
});
test("timeout clears request and stop rejects remaining requests", async () => {
  const child = fake(),
    c = new CodexClient(
      () => child as unknown as ChildProcessWithoutNullStreams,
      10,
    );
  c.child = child as unknown as ChildProcessWithoutNullStreams;
  await assert.rejects(c.request("timeout"));
  assert.equal(c.pending.size, 0);
  const pending = c.request("stop");
  c.stop();
  await assert.rejects(pending);
  assert.equal(c.pending.size, 0);
});
