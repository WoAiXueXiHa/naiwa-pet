import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";

// Resolve a native executable, avoiding shell interpretation and token-file access.
export function findCodex(env: NodeJS.ProcessEnv = process.env): string {
  // Only the desktop client installation is an allowed service source.
  if (env.LOCALAPPDATA) {
    const bin = join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    try {
      const candidates = readdirSync(bin)
        .map((name) => join(bin, name, "codex.exe"))
        .filter(existsSync)
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      if (candidates.length) return candidates[0];
    } catch {
      /* Do not fall back to a separately installed CLI. */
    }
  }
  throw new Error("未找到 Codex 客户端服务，请安装或更新 Codex 客户端后重试。");
}
export class CodexClient extends EventEmitter {
  constructor(
    private readonly launch: () => ChildProcessWithoutNullStreams = () =>
      spawn(findCodex(), ["app-server", "--listen", "stdio://"], {
        windowsHide: true,
        stdio: "pipe",
      }),
    private readonly timeoutMs = 25000,
  ) {
    super();
  }
  child: ChildProcessWithoutNullStreams | null = null;
  pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  nextId = 0;
  ready: Promise<void> | null = null;
  stopping = false;
  async start() {
    if (this.ready) return this.ready;
    this.stopping = false;
    this.ready = (async () => {
      const child = this.launch();
      this.child = child;
      createInterface({ input: child.stdout }).on("line", (line) => {
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
        if (
          typeof msg.id === "number" &&
          (msg.result !== undefined || msg.error)
        ) {
          const req = this.pending.get(msg.id);
          if (!req) return;
          clearTimeout(req.timer);
          this.pending.delete(msg.id);
          if (msg.error) req.reject(new Error("Codex 接口错误，请稍后重试。"));
          else req.resolve(msg.result);
        } else if (msg.method === "account/rateLimits/updated")
          this.emit("quota", msg.params);
        else if (msg.method === "account/updated") this.emit("account");
        else if (msg.method === "account/login/completed")
          this.emit("login", msg.params);
        else if (msg.id !== undefined && msg.method) {
          child.stdin.write(
            JSON.stringify({
              id: msg.id,
              error: { code: -32601, message: "Unsupported request" },
            }) + "\n",
          );
        }
      });
      // Drain diagnostics without persisting potentially sensitive protocol logs.
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => end("Codex 通信中断。"));
      const end = (message: string) => {
        if (this.child !== child) return;
        this.child = null;
        this.ready = null;
        for (const req of this.pending.values()) {
          clearTimeout(req.timer);
          req.reject(new Error(message));
        }
        this.pending.clear();
        if (!this.stopping) this.emit("disconnected", message);
      };
      child.on("error", () => end("无法启动 Codex，请检查安装路径。"));
      child.on("exit", () => end("Codex 额度连接已断开。"));
      await this.request("initialize", {
        clientInfo: {
          name: "naiwa_desktop",
          title: "奶蛙桌宠",
          version: "1.1.1",
        },
        capabilities: { experimentalApi: true },
      });
      this.notify("initialized");
    })();
    try {
      await this.ready;
    } catch (e) {
      this.stop();
      throw e;
    }
  }
  notify(method: string, params?: any) {
    this.child?.stdin.write(
      JSON.stringify({ method, ...(params ? { params } : {}) }) + "\n",
    );
  }
  request(method: string, params?: any): Promise<any> {
    if (!this.child) return Promise.reject(new Error("Codex 尚未连接"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex 读取超时，请稍后重试。"));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const child = this.child;
      if (!child || child.stdin.destroyed) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("Codex 通信中断。"));
        return;
      }
      child.stdin.write(
        JSON.stringify({
          id,
          method,
          ...(params !== undefined ? { params } : {}),
        }) + "\n",
        (err) => {
          if (err) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(new Error("Codex 通信中断。"));
          }
        },
      );
    });
  }
  async account() {
    await this.start();
    return this.request("account/read", { refreshToken: false });
  }
  async read() {
    await this.start();
    return this.request("account/rateLimits/read");
  }
  stop() {
    this.stopping = true;
    const c = this.child;
    this.child = null;
    this.ready = null;
    c?.stdin.end();
    c?.kill();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("连接已关闭"));
    }
    this.pending.clear();
  }
}
