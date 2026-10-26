import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const qa = resolve("artifacts/packaged");
await mkdir(qa, { recursive: true });
const child = spawn(
  resolve("release/win-unpacked/奶蛙桌宠.exe"),
  ["--smoke-test", ...process.argv.slice(2)],
  {
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NAIWA_QA_DIR: qa,
      NAIWA_QA_USERDATA: resolve("artifacts/qa-userdata"),
    },
  },
);
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
