import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
const execute = promisify(execFile);
export async function desktopSession(): Promise<string> {
  const command =
    "$p=Get-Process -Name ChatGPT,Codex -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\WindowsApps\\OpenAI.Codex_*\\app\\ChatGPT.exe' -or $_.Path -like '*\\OpenAI\\Codex\\app\\ChatGPT.exe' -or ($_.Path -like '*\\Codex\\Codex.exe' -and $_.Path -notlike '*\\bin\\*') } | Sort-Object StartTime | Select-Object -First 1; if($p){[Console]::Write([string]$p.Id+':'+$p.StartTime.Ticks)}";
  const { stdout } = await execute(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 5000, maxBuffer: 4096 },
  );
  return stdout.trim();
}
export class DesktopMonitor extends EventEmitter {
  session: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void> | null = null;
  private disposed = false;
  constructor(
    private readonly probe = desktopSession,
    private readonly interval = 5000,
  ) {
    super();
  }
  check(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.probe()
      .then((session) => {
        if (!this.disposed && session !== this.session) {
          this.session = session;
          this.emit("change", session);
        }
      })
      .catch(() => {
        if (!this.disposed) this.emit("probe-failed");
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  start() {
    if (this.timer || this.disposed) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), this.interval);
  }
  stop() {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
