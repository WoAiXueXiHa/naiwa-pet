import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedSender } from "../src/ipc-policy";
import { sanitizeSettings } from "../src/rules";
test("IPC rejects foreign contents and child frames; settings reject unknown and invalid values", () => {
  const owner = {},
    main = {},
    child = {};
  assert.equal(trustedSender(owner, main, main, [owner]), true);
  assert.equal(trustedSender({}, main, main, [owner]), false);
  assert.equal(trustedSender(owner, child, main, [owner]), false);
  assert.equal(trustedSender(owner, null, null, [owner]), false);
  assert.deepEqual(
    sanitizeSettings({
      size: NaN,
      volume: Infinity,
      sound: "yes",
      x: 999,
      command: "execute",
    }),
    {},
  );
});
