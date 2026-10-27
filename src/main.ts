import { DesktopMonitor } from "./desktop-monitor";
import { Scheduler } from "./scheduler";
import { spriteVisible, resizedBounds, petWindowSize } from "./windows";
import { loadState, saveState } from "./storage";
import { redact, maskAccount } from "./privacy";
import { registerIpc } from "./ipc";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  Notification,
  screen,
  powerMonitor,
} from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { CodexClient } from "./codex";
import {
  DEFAULT_SETTINGS,
  normalizeQuota,
  thresholdAlerts,
  quotaHours,
  breakDue,
  beijingParts,
  clampPosition,
  sanitizeSettings,
  freeDragPosition,
  dragFacing,
} from "./rules";
import type { Settings, QuotaState, Snapshot } from "./types";

let pet: BrowserWindow | null = null,
  panel: BrowserWindow | null = null,
  tray: Tray | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };
let quota: QuotaState = {
  clientRunning: false,
  windows: [],
  account: "尚未连接",
  accountId: "",
  updatedAt: null,
  error: null,
  connected: false,
};
let seen: Record<string, boolean> = {},
  lastBreak = "",
  lastCheck = 0,
  failures = 0,
  busy = false,
  snoozeAt = 0,
  snoozed = false;
let storePath = "",
  closing = false,
  dragTimer: ReturnType<typeof setInterval> | null = null,
  dragging = false;
const codex = new CodexClient();
let qaSession = "qa-client";
const desktopMonitor = new DesktopMonitor(
  process.argv.includes("--smoke-test") &&
  !process.argv.includes("--live-quota")
    ? async () => qaSession
    : undefined,
);
let pendingClientRefresh = false;
desktopMonitor.on("change", (session: string) => {
  quota.clientRunning = !!session;
  if (!session) {
    codex.stop();
    quota.connected = false;
    quota.error = quota.updatedAt
      ? "Codex 客户端已关闭，上次额度未更新。"
      : "等待 Codex 客户端启动。";
    broadcast();
  } else {
    if (busy) pendingClientRefresh = true;
    else void refresh(true);
  }
});
desktopMonitor.on("probe-failed", () => {
  if (desktopMonitor.session === null) {
    quota.error = "暂时无法检测 Codex 客户端，请稍后刷新。";
    broadcast();
  }
});

// Small raster sprites do not need GPU acceleration; avoid driver-dependent
// transparent-window crashes on this Windows machine.
app.disableHardwareAcceleration();
if (process.argv.includes("--smoke-test")) {
  const qaRuntime =
    process.env.NAIWA_QA_USERDATA ||
    join(app.getPath("temp"), "naiwa-qa-runtime");
  mkdirSync(qaRuntime, { recursive: true });
  app.setPath("userData", qaRuntime);
}
function save() {
  if (!storePath) return;
  try {
    saveState(storePath, { settings, seen, lastBreak });
  } catch {
    console.warn("设置保存失败，请检查用户数据目录权限。");
  }
}
function snapshot(): Snapshot {
  const { accountId, ...publicQuota } = quota;
  return {
    settings,
    quota: publicQuota,
    version: app.getVersion(),
    paused: Date.now() < settings.pausedUntil,
  };
}
function broadcast() {
  for (const w of [pet, panel])
    if (w && !w.isDestroyed()) w.webContents.send("snapshot", snapshot());
}
function bubble(text: string, kind = "info") {
  pet?.webContents.send("bubble", { text, kind });
}
function formatReset(n: number | null) {
  return n
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(n)
    : "暂不可用";
}
function notify(title: string, body: string, kind = "info") {
  bubble(body, kind);
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: true });
    n.on("click", () => openPanel(kind === "break" ? "settings" : "quota"));
    n.show();
  }
}
function applyQuota(raw: any) {
  const windows = normalizeQuota(raw);
  if (!windows.length) throw new Error("额度响应无有效窗口，请稍后重试。");
  quota = {
    ...quota,
    windows,
    updatedAt: Date.now(),
    error: null,
    connected: true,
  };
  failures = 0;
  if (
    settings.quotaReminders &&
    quotaHours(Date.now()) &&
    Date.now() >= settings.pausedUntil
  ) {
    const alerts = thresholdAlerts(quota.accountId || "unknown", windows, seen);
    if (alerts.length) {
      notify(
        "奶蛙 · 额度提醒",
        alerts
          .map(
            (a) =>
              `${a.window.name} 剩余 ${Math.round(a.window.remaining!)}%，${formatReset(a.window.resetsAt)} 重置`,
          )
          .join("\n"),
        "quota",
      );
      save();
    }
  }
  // Drop records well after their reset, bounded even after months of use.
  if (Object.keys(seen).length > 300)
    seen = Object.fromEntries(
      Object.entries(seen).filter(
        ([k]) => Number(k.split("|").at(-2)) > Date.now() - 7 * 86400000,
      ),
    );
  broadcast();
}
async function refresh(manual = false) {
  if (busy) return;
  if (!manual && !quotaHours(Date.now())) return;
  busy = true;
  pendingClientRefresh = false;
  lastCheck = Date.now();
  try {
    await desktopMonitor.check();
    if (!desktopMonitor.session) return;
    const clientSession = desktopMonitor.session;
    const mock =
      process.argv.includes("--smoke-test") &&
      !process.argv.includes("--live-quota");
    if (!mock) codex.stop(); // Reload the client login state on every check.
    const { account } = mock
      ? { account: { type: "chatgpt", id: "qa-mock" } }
      : await codex.account();
    if (desktopMonitor.session !== clientSession) return;
    if (!account)
      throw new Error(
        "尚未登录，请在 Codex 客户端中登录 ChatGPT 账号，再点击刷新额度。",
      );
    if (account.type === "apiKey")
      throw new Error(
        "客户端当前未使用 ChatGPT 套餐账号，请在 Codex 客户端中切换登录后刷新。",
      );
    const identity = createHash("sha256")
      .update(
        String(
          account.email || account.accountId || account.id || account.type,
        ),
      )
      .digest("hex")
      .slice(0, 24);
    const masked = account.email
      ? maskAccount(account.email)
      : String(account.type || "ChatGPT");
    if (quota.accountId && quota.accountId !== identity) quota.windows = [];
    quota.account = masked;
    quota.accountId = identity;
    const raw = mock
      ? {
          rateLimits: {
            primary: {
              usedPercent: 25,
              windowDurationMins: 300,
              resetsAt: Math.floor(Date.now() / 1000) + 3600,
            },
          },
        }
      : await codex.read();
    if (desktopMonitor.session !== clientSession) return;
    applyQuota(raw);
  } catch (e) {
    if (!quota.clientRunning) return;
    quota.error = e instanceof Error ? redact(e.message) : "额度读取失败";
    quota.connected = false;
    failures++;
    broadcast();
    if (
      failures === 3 &&
      quotaHours(Date.now()) &&
      Date.now() >= settings.pausedUntil
    )
      notify(
        "奶蛙 · 额度连接异常",
        "连续三次无法读取额度，请打开额度面板检查连接。",
      );
  } finally {
    busy = false;
    if (pendingClientRefresh && quota.clientRunning) void refresh(true);
  }
}
function fitPosition() {
  if (!pet) return;
  const b = pet.getBounds();
  const visible = spriteVisible(
    b,
    settings.size,
    screen.getAllDisplays().map((d) => d.bounds),
  );
  if (visible) return;
  const area = screen.getPrimaryDisplay().bounds;
  pet.setPosition(
    Math.round(area.x + area.width - b.width - 20),
    Math.round(area.y + area.height - b.height - 30),
  );
}
function petWidth() {
  return petWindowSize(settings.size).width;
}
function resize() {
  if (!pet) return;
  const old = pet.getBounds(),
    width = petWidth(),
    height = petWindowSize(settings.size).height;
  const center = old.x + old.width / 2,
    foot = old.y + old.height - 38;
  pet.setBounds(resizedBounds(old, settings.size));
  const actual = pet.getBounds();
  pet.setPosition(
    Math.round(center - actual.width / 2),
    Math.round(foot - actual.height + 38),
  );
  pet.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
  fitPosition();
  const p = pet.getPosition();
  settings.x = p[0];
  settings.y = p[1];
}
function stopDrag() {
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
  if (!dragging) return;
  dragging = false;
  pet?.webContents.send("drag-motion", "idle");
  if (pet) {
    const p = pet.getPosition();
    settings.x = p[0];
    settings.y = p[1];
    save();
  }
}
let lastRunDirection: "run-left" | "run-right" = "run-left";
function startDrag(origin: { x: number; y: number }) {
  if (!pet || dragging) return;
  dragging = true;
  pet.setIgnoreMouseEvents(false);
  const base = pet.getBounds();
  let previous = origin,
    lastMoved = Date.now(),
    lastTick = performance.now();
  dragTimer = setInterval(() => {
    if (!pet) return;
    const p = screen.getCursorScreenPoint(),
      dx = p.x - previous.x,
      dy = p.y - previous.y,
      now = performance.now();
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      lastMoved = Date.now();
      lastRunDirection = dragFacing(dx, dy, lastRunDirection);
      pet.webContents.send("drag-motion", {
        action: lastRunDirection,
        dx,
        dy,
        angle: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
        speed: (Math.hypot(dx, dy) / Math.max(1, now - lastTick)) * 1000,
      });
    } else if (Date.now() - lastMoved > 150)
      pet.webContents.send("drag-motion", "idle");
    const pos = freeDragPosition(base, origin, p);
    pet.setPosition(pos.x, pos.y);
    previous = p;
    lastTick = now;
  }, 16);
}
function openPanel(view = "quota") {
  if (panel && !panel.isDestroyed()) {
    panel.show();
    panel.focus();
    panel.webContents.send("view", view);
    return;
  }
  panel = new BrowserWindow({
    width: 650,
    height: 720,
    minWidth: 540,
    minHeight: 560,
    show: false,
    title: "奶蛙 · " + (view === "quota" ? "额度" : "设置"),
    backgroundColor: "#f7f8ef",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const openingPanel = panel;
  openingPanel.once("ready-to-show", () => {
    if (!process.argv.includes("--smoke-test")) openingPanel.show();
  });
  openingPanel.webContents.on("render-process-gone", () => {
    if (!openingPanel.isDestroyed()) openingPanel.reload();
  });
  panel.loadFile(join(__dirname, "index.html"), { query: { panel: view } });
  panel.on("closed", () => (panel = null));
  if (quotaHours(Date.now())) void refresh();
}
function trayMenu() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示奶蛙",
        click: () => {
          pet?.showInactive();
          fitPosition();
        },
      },
      { label: "查看额度", click: () => openPanel("quota") },
      { label: "设置", click: () => openPanel("settings") },
      { type: "separator" },
      {
        label:
          Date.now() < settings.pausedUntil ? "恢复提醒" : "暂停提醒一小时",
        click: () => {
          settings.pausedUntil =
            Date.now() < settings.pausedUntil ? 0 : Date.now() + 3600000;
          save();
          broadcast();
          trayMenu();
        },
      },
      { label: "隐藏奶蛙", click: () => pet?.hide() },
      { label: "退出", click: () => app.quit() },
    ]),
  );
}
function schedule() {
  const now = Date.now(),
    bp = beijingParts(now),
    key = bp.date + ":" + bp.hour;
  if (quotaHours(now) && now - lastCheck >= 30 * 60000) void refresh();
  if (
    settings.breakReminders &&
    now >= settings.pausedUntil &&
    breakDue(now) &&
    key !== lastBreak
  ) {
    lastBreak = key;
    snoozed = false;
    save();
    notify("奶蛙 · 休息一下", "起来活动 5 分钟吧，伸伸腿、看看远处。", "break");
  }
  if (snoozeAt && now >= snoozeAt) {
    snoozeAt = 0;
    if (settings.breakReminders && now >= settings.pausedUntil)
      notify("奶蛙 · 休息一下", "十分钟到了，起来活动 5 分钟吧。", "break");
  }
}
if (!app.requestSingleInstanceLock() || process.argv.includes("--quit"))
  app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--quit")) {
      app.quit();
      return;
    }
    pet?.showInactive();
    openPanel();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId("local.naiwa.desktop");
    app.on("web-contents-created", (_event, contents) => {
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      contents.on("will-navigate", (e) => e.preventDefault());
    });
    storePath = join(app.getPath("userData"), "settings.json");
    mkdirSync(app.getPath("userData"), { recursive: true });
    ({ settings, seen, lastBreak } = loadState(storePath));
    if (process.argv.includes("--smoke-test")) {
      settings.size = DEFAULT_SETTINGS.size;
      settings.sound = false;
    }
    const display = screen.getPrimaryDisplay().workArea;
    pet = new BrowserWindow({
      width: petWidth(),
      height: petWindowSize(settings.size).height,
      x: settings.x ?? display.x + display.width - petWidth() - 20,
      y: settings.y ?? display.y + display.height - settings.size - 302,
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: settings.alwaysOnTop,
      show: false,
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        offscreen: process.argv.includes("--smoke-test"),
      },
    });
    pet.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
    pet.loadFile(join(__dirname, "index.html"));
    pet.once("ready-to-show", () => {
      fitPosition();
      if (!process.argv.includes("--smoke-test")) pet?.showInactive();
    });
    pet.on("close", (e) => {
      if (!closing) {
        e.preventDefault();
        pet?.hide();
      }
    });
    pet.webContents.on("render-process-gone", () => {
      stopDrag();
      pet?.reload();
    });
    const iconPath = join(__dirname, "../assets/tray.png");
    let icon = existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createFromDataURL(
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7VQAAAAASUVORK5CYII=",
        );
    tray = new Tray(icon.resize({ width: 24, height: 24 }));
    tray.setToolTip("奶蛙桌宠");
    trayMenu();
    tray.on("double-click", () => openPanel());
    screen.on("display-removed", fitPosition);
    screen.on("display-metrics-changed", fitPosition);
    powerMonitor.on("resume", () => {
      lastBreak =
        beijingParts(Date.now()).date + ":" + beijingParts(Date.now()).hour;
      snoozeAt = 0;
      void refresh();
    });
    codex.on("quota", () => {
      if (quota.accountId && !busy) void refresh(true);
    });
    codex.on("account", () => {
      void refresh();
    });
    codex.on("login", () => {
      void refresh(true);
    });
    codex.on("disconnected", () => {
      quota.connected = false;
      quota.error = "Codex 连接断开，下次检查将重连。";
      broadcast();
    });
    const ipc = registerIpc(() => [pet, panel]);
    app.once("before-quit", () => ipc.dispose());
    ipc.handle("snapshot", () => snapshot());
    ipc.handle("settings", (_e, patch) => {
      settings = { ...settings, ...sanitizeSettings(patch) };
      resize();
      save();
      broadcast();
      return snapshot();
    });
    ipc.handle("refresh", async () => {
      await refresh(true);
      return snapshot();
    });
    ipc.on("panel", (_e, view) =>
      openPanel(view === "settings" ? "settings" : "quota"),
    );
    ipc.on("context", () =>
      Menu.buildFromTemplate([
        { label: "查看额度", click: () => openPanel() },
        { label: "设置", click: () => openPanel("settings") },
        { label: "隐藏", click: () => pet?.hide() },
        { label: "退出", click: () => app.quit() },
      ]).popup({ window: pet! }),
    );
    ipc.on("hit", (_e, hit) => {
      if (typeof hit !== "boolean") return;
      if (!dragging) pet?.setIgnoreMouseEvents(!hit, { forward: true });
    });
    ipc.on("drag-start", (_e, p) => {
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) startDrag(p);
    });
    ipc.on("drag-stop", stopDrag);
    ipc.on("pause", () => {
      settings.pausedUntil = Date.now() + 3600000;
      save();
      broadcast();
      trayMenu();
    });
    ipc.on("resume-reminders", () => {
      settings.pausedUntil = 0;
      save();
      broadcast();
      trayMenu();
    });
    ipc.on("snooze", () => {
      if (!snoozed) {
        snoozed = true;
        snoozeAt = Date.now() + 600000;
        bubble("好，10 分钟后提醒你。");
      } else bubble("这次提醒已经延后过一次啦。");
    });
    ipc.on("hide", () => pet?.hide());
    ipc.on("test-reminder", () =>
      notify("奶蛙 · 提醒测试", "奶蛙在这里。额度低时和休息时间会这样提醒你。"),
    );
    ipc.on("online", () => {
      if (Date.now() - lastCheck > 60000) void refresh();
    });
    const scheduler = new Scheduler(() => {
      schedule();
      broadcast();
      trayMenu();
    });
    scheduler.start();
    app.once("before-quit", () => scheduler.stop());
    desktopMonitor.start();
    if (process.argv.includes("--smoke-test")) {
      setTimeout(() => void smokeTest(), 5000);
    }
  });
  app.on("before-quit", () => {
    desktopMonitor.stop();
    closing = true;
    stopDrag();
    save();
    codex.stop();
    tray?.destroy();
  });
  app.on("window-all-closed", () => {});
}

async function smokeTest() {
  const qa = process.env.NAIWA_QA_DIR || join(app.getPath("userData"), "qa");
  mkdirSync(qa, { recursive: true });
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const checks: { name: string; ok: boolean; detail?: any }[] = [];
  try {
    if (!process.argv.includes("--live-quota")) {
      const previousUpdate = quota.updatedAt;
      qaSession = "";
      await desktopMonitor.check();
      await refresh(true);
      checks.push({
        name: "closed-client-keeps-pet-and-stops-quota",
        ok:
          !quota.clientRunning &&
          !quota.connected &&
          codex.child === null &&
          quota.updatedAt === previousUpdate &&
          !!pet &&
          !pet.isDestroyed(),
      });
      qaSession = "qa-reopened";
      await desktopMonitor.check();
      const deadline = Date.now() + 2000;
      while (busy && Date.now() < deadline) await wait(20);
      checks.push({
        name: "opening-client-auto-connects-quota",
        ok: quota.clientRunning && quota.connected && quota.windows.length > 0,
      });
    }
    const bubbleLayouts: any[] = [];
    for (const size of [40, 80, 160, 360]) {
      await pet!.webContents.executeJavaScript(
        `window.naiwa.settings({size:${size}})`,
      );
      bubble("起来活动 5 分钟吧，伸伸腿、看看远处。", "break");
      await wait(120);
      bubbleLayouts.push(
        await pet!.webContents.executeJavaScript(
          `(()=>{const b=document.querySelector('.bubble').getBoundingClientRect(),c=document.querySelector('canvas').getBoundingClientRect();return {size:${size},gap:c.top-b.bottom,top:b.top,bottom:b.bottom,canvasTop:c.top};})()`,
        ),
      );
    }
    checks.push({
      name: "bubble-stays-above-pet-at-all-scales",
      ok: bubbleLayouts.every((r) => r.gap >= 15 && r.top >= 0),
      detail: bubbleLayouts,
    });
    await pet!.webContents.executeJavaScript(
      "window.naiwa.settings({size:140})",
    );
    await wait(120);
    writeFileSync(
      join(qa, "bubble-layout.png"),
      (await pet!.webContents.capturePage()).toPNG(),
    );
    await pet!.webContents.executeJavaScript(
      `document.querySelector('.bubble').classList.add('hidden');window.naiwa.settings({size:80});`,
    );
    await wait(120);
    const canvas = await pet!.webContents.executeJavaScript(
      `(()=>{const c=document.querySelector('canvas');if(!c)return null;const r=c.getBoundingClientRect();return {action:c.dataset.action,width:c.width,height:c.height,x:r.x,y:r.y,w:r.width,h:r.height}})()`,
    );
    const manifest = JSON.parse(
      readFileSync(join(__dirname, "../assets/manifest.json"), "utf8"),
    );
    checks.push({
      name: "pose-bridges-available",
      ok:
        !!manifest.bridges?.["idle:0>run-left"] &&
        !!manifest.bridges?.["run-left:0>idle"] &&
        Object.values(manifest.bridges || {}).every((a: any) =>
          a.frames.every((f: any) =>
            existsSync(join(__dirname, "../assets", f.file)),
          ),
        ),
    });
    const actionDuration = (name: string) =>
      manifest.animations[name].frames.reduce(
        (sum: number, f: any) =>
          sum + (f.durationMs || 1000 / manifest.animations[name].fps),
        0,
      );
    checks.push({
      name: "pet-renders-idle",
      ok: canvas?.action === "idle",
      detail: canvas,
    });
    if (!canvas) throw new Error("Canvas not found");
    const click = async (x: number, y: number) => {
      await pet!.webContents.executeJavaScript(
        `(()=>{const c=document.querySelector('canvas');for(const type of ['pointerdown','pointerup'])c.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:${x},clientY:${y},screenX:${x},screenY:${y},button:0,buttons:type==='pointerdown'?1:0,pointerId:7}));})()`,
      );
      await wait(180);
    };
    await click(canvas.x + canvas.w * 0.52, canvas.y + canvas.h * 0.6);
    const laugh = await pet!.webContents.executeJavaScript(
      `document.querySelector('canvas').dataset.action`,
    );
    checks.push({
      name: "body-click-laughs",
      ok: laugh === "laugh",
      detail: laugh,
    });
    await wait(600);
    writeFileSync(
      join(qa, "desktop-laugh.png"),
      (await pet!.webContents.capturePage()).toPNG(),
    );
    await wait(actionDuration("laugh") + 200);
    const eye = manifest.animations.idle.frames[0].eyes?.[0];
    if (eye) {
      await click(
        canvas.x + (canvas.w * (eye[0] + eye[2])) / 2,
        canvas.y + (canvas.h * (eye[1] + eye[3])) / 2,
      );
      const glance = await pet!.webContents.executeJavaScript(
        `document.querySelector('canvas').dataset.action`,
      );
      checks.push({
        name: "eye-click-glances",
        ok: glance === "glance",
        detail: glance,
      });
    }
    await wait(actionDuration("glance") + 200);
    writeFileSync(
      join(qa, "desktop-idle.png"),
      (await pet!.webContents.capturePage()).toPNG(),
    );
    const drag = await pet!.webContents.executeJavaScript(
      `(async()=>{const c=document.querySelector('canvas');const x=${canvas.x + canvas.w * 0.52},y=${canvas.y + canvas.h * 0.6};c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,screenX:500,screenY:500,button:0,buttons:1,pointerId:8}));c.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:x+14,clientY:y,screenX:514,screenY:500,button:0,buttons:1,pointerId:8}));await new Promise(r=>setTimeout(r,100));const started=c.dataset.dragging==='true';c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x+14,clientY:y,screenX:514,screenY:500,button:0,buttons:0,pointerId:8}));return {started,action:c.dataset.action};})()`,
    );
    checks.push({
      name: "drag-release-does-not-laugh",
      ok: drag.started && drag.action === "idle",
      detail: drag,
    });
    const audioDuration = await pet!.webContents.executeJavaScript(
      `new Promise(resolve=>{const a=new Audio('../assets/laugh.mp3');a.onloadedmetadata=()=>resolve(a.duration);a.onerror=()=>resolve(0);setTimeout(()=>resolve(0),5000);})`,
    );
    checks.push({
      name: "bundled-audio-readable",
      ok: audioDuration > 3 && audioDuration < 5,
      detail: audioDuration,
    });
    checks.push({
      name: "laugh-duration-matches-audio",
      ok: Math.abs(actionDuration("laugh") - audioDuration * 1000) < 30,
      detail: {
        animationMs: actionDuration("laugh"),
        audioMs: audioDuration * 1000,
      },
    });
    const originalBounds = pet!.getBounds(),
      desktop = screen.getPrimaryDisplay().bounds;
    let freePosition = true;
    for (const point of [
      {
        x: desktop.x - Math.round(originalBounds.width / 2),
        y: desktop.y - 80,
      },
      {
        x: desktop.x + desktop.width - Math.round(originalBounds.width / 2),
        y: desktop.y + desktop.height - (originalBounds.height - 38) + 20,
      },
    ]) {
      pet!.setPosition(point.x, point.y);
      fitPosition();
      const actual = pet!.getPosition();
      freePosition =
        freePosition &&
        Math.abs(actual[0] - point.x) <= 2 &&
        Math.abs(actual[1] - point.y) <= 2;
    }
    pet!.setBounds(originalBounds);
    checks.push({
      name: "native-position-supports-edge-and-taskbar-regions",
      ok: freePosition,
    });
    openPanel("quota");
    await wait(2500);
    writeFileSync(
      join(qa, "quota-panel.png"),
      (await panel!.webContents.capturePage()).toPNG(),
    );
    const body = await panel!.webContents.executeJavaScript(
      "document.body.innerText",
    );
    checks.push({
      name: "quota-panel-renders",
      ok: body.includes("Codex 额度") && body.includes("刷新额度"),
    });
    if (!quota.connected) {
      const deadline = Date.now() + 25000;
      while (busy && Date.now() < deadline) await wait(250);
      if (!quota.connected && !busy) await refresh(true);
    }
    checks.push({
      name: "quota-provider-readable",
      ok: quota.connected && quota.windows.length > 0,
      detail: quota.windows.map((w) => ({
        name: w.name,
        remaining: w.remaining,
      })),
    });
    panel!.webContents.send("view", "settings");
    await wait(500);
    writeFileSync(
      join(qa, "settings-panel.png"),
      (await panel!.webContents.capturePage()).toPNG(),
    );
    checks.push({
      name: "settings-render",
      ok: (
        await panel!.webContents.executeJavaScript("document.body.innerText")
      ).includes("捧腹大笑时播放笑声"),
    });
    await panel!.webContents.executeJavaScript(
      `(()=>{const range=document.querySelector('input[data-setting="size"]');range.value='120';range.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await wait(250);
    const renderedSize = await pet!.webContents.executeJavaScript(
      `document.querySelector('canvas').getBoundingClientRect().height`,
    );
    checks.push({
      name: "live-scale-slider-updates-before-release",
      ok: settings.size === 120 && Math.abs(renderedSize - 120) < 1,
      detail: { size: settings.size, renderedSize, window: pet!.getBounds() },
    });
    await panel!.webContents.executeJavaScript(
      `(()=>{const range=document.querySelector('input[data-setting="size"]');range.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await wait(150);
    await panel!.webContents.executeJavaScript(
      `window.naiwa.settings({size:80})`,
    );
    await wait(100);
    checks.push({ name: "small-scale-restored", ok: settings.size === 80 });
  } catch (e) {
    checks.push({ name: "exception", ok: false, detail: String(e) });
  }
  writeFileSync(
    join(qa, "desktop-checks.json"),
    JSON.stringify(
      { at: new Date().toISOString(), checks, ok: checks.every((c) => c.ok) },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, ok: checks.every((c) => c.ok) }));
  closing = true;
  stopDrag();
  save();
  codex.stop();
  app.exit(checks.every((c) => c.ok) ? 0 : 1);
}
