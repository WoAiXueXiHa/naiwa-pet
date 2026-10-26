import { redact } from "../src/privacy";
import { CodexClient, findCodex } from "../src/codex";
import { normalizeQuota } from "../src/rules";
const c = new CodexClient();
try {
  findCodex();
  console.log("Codex: 已找到本地程序");
  const a = await c.account();
  console.log("Auth:", a.account?.type || "未登录");
  const r = await c.read();
  console.log(
    JSON.stringify({ windows: normalizeQuota(r), ok: true }, null, 2),
  );
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
} finally {
  c.stop();
}
