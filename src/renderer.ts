import type { Snapshot, Settings } from "./types";
import { mountPet } from "./pet";
declare global {
  interface Window {
    naiwa: import("./types").PetApi;
  }
}
const api = window.naiwa;
const root = document.getElementById("app")!;
const panelMode = new URLSearchParams(location.search).get("panel");
let currentView = panelMode || "quota",
  state: Snapshot;
let editingRange = false;
const escape = (v: any) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const time = (n: number | null) =>
  n
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(n)
    : "暂不可用";
async function boot() {
  state = await api.snapshot();
  if (panelMode) {
    document.body.className = "panel";
    renderPanel();
  } else await bootPet();
  api.on("snapshot", (s) => {
    state = s;
    if (panelMode) {
      if (!editingRange) renderPanel();
    } else updateBadge();
  });
  api.on("view", (v) => {
    currentView = v;
    renderPanel();
  });
  window.addEventListener("online", () => api.send("online"));
  window.addEventListener("blur", () => {
    if (panelMode && editingRange) {
      editingRange = false;
      renderPanel();
    }
  });
}
function renderPanel() {
  const q = state.quota,
    s = state.settings;
  const quotaHTML = `<section class="card"><div class="account"><i class="dot ${q.connected ? "" : "off"}"></i><span>${escape(q.account)}</span></div><p class="muted">当前连接的 Codex CLI 账号 · 请与 Codex 桌面账号核对</p>${q.error ? `<div class="error">${escape(q.error)}${q.updatedAt ? "<br>下方保留上次读取结果。" : ""}</div>` : ""}${q.windows.length ? q.windows.map((w) => `<div class="quota-row"><div class="quota-line"><span>${escape(w.name)}</span><strong>${w.remaining === null ? "—" : Math.round(w.remaining) + "<small>%</small>"}</strong></div><div class="meter ${(w.remaining ?? 100) <= 20 ? "low" : ""}"><i style="width:${w.remaining ?? 0}%"></i></div><div class="meta"><span>${w.durationMins ? escape(duration(w.durationMins)) : "窗口时长未知"} · 剩余</span><span>${time(w.resetsAt)} 重置</span></div></div>`).join("") : '<p class="welcome">连接后，这里会显示各个额度窗口的剩余比例和重置时间。</p>'}</section>
    <section class="card"><h2>安静地帮你留意</h2><p class="muted">每天 09:00—23:00，每 30 分钟检查。剩余 20%、10%、5% 时各提醒一次，跨档合并、不重复打扰。时间均为北京时间。</p><div class="actions"><button class="primary" id="refresh">刷新额度</button><button id="login">登录 Codex</button></div><p class="muted" id="login-note"></p></section><div class="foot">${q.updatedAt ? "上次更新 " + time(q.updatedAt) : "尚无额度数据"} · ${q.connected ? "已连接" : "未连接"}</div>`;
  const toggle = (key: keyof Settings, title: string, description: string) =>
    `<label class="setting"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" data-setting="${key}" ${s[key] ? "checked" : ""}></label>`;
  const settingsHTML = `<section class="card"><h2>你的奶蛙</h2>
    <label class="setting"><span><strong>显示大小 · 实时预览</strong><small>${Math.round((s.size / 160) * 100)}% · ${s.size} 像素 · 40—360</small></span><input type="range" min="40" max="360" step="4" value="${s.size}" data-setting="size"></label>
    <div class="actions"><button data-size="40">25%</button><button data-size="80">50%</button><button data-size="160">100%</button></div><p class="muted">拖动滑杆即时调整，或在奶蛙身上按 Ctrl + 滚轮。调整后自动保存。</p>
    ${toggle("alwaysOnTop", "保持置顶", "让奶蛙待在其它普通窗口上方")}${toggle("quotaLabel", "显示额度标签", "在奶蛙下方显示最低剩余额度")}
    ${toggle("sound", "捧腹大笑时播放笑声", "使用你提供的「奶蛙笑声.mp3」，只播放一次")}
    <label class="setting"><span><strong>笑声音量</strong><small>${Math.round(s.volume * 100)}%</small></span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-setting="volume"></label>
    <div class="actions" style="margin-top:14px"><button id="test-sound">试听笑声</button></div></section>
    <section class="card"><h2>提醒</h2>${toggle("quotaReminders", "额度低时提醒", "每天 09:00—23:00 检查，20% / 10% / 5% 各提醒一次")}${toggle("breakReminders", "起身休息提醒", "每天 10:00—22:00 整点，跳过 12、13、18、19 点；活动 5 分钟")}
    <p class="muted">${state.paused ? "提醒已暂停，" + time(s.pausedUntil) + " 恢复" : "提醒正常运行"}。程序退出或电脑睡眠时不运行，恢复后不补发休息提醒。</p><div class="actions"><button id="pause">${state.paused ? "恢复提醒" : "暂停提醒一小时"}</button><button id="test-reminder">测试提醒</button></div></section>
    <section class="card"><h2>互动小抄</h2><div class="help-grid"><div>点身体<span>捧腹大笑</span></div><div>点眼睛<span>惊鸿一瞥</span></div><div>按住拖动<span>向左 / 向右跑步</span></div><div>点击右键<span>额度、设置、隐藏、退出</span></div></div><p class="muted">开机启动默认关闭。关闭设置窗口后，奶蛙仍在托盘运行。</p></section>`;
  root.innerHTML = `<div class="shell"><div class="eyebrow">NAIWA · DESKTOP COMPANION</div><header class="header"><div><h1>奶蛙陪你工作</h1><p>认真工作，也记得笑一笑。</p></div><img class="mini-pet" src="../assets/base.png" alt="奶蛙"></header><nav class="tabs"><button data-view="quota" class="${currentView === "quota" ? "active" : ""}">Codex 额度</button><button data-view="settings" class="${currentView === "settings" ? "active" : ""}">奶蛙设置</button></nav>${currentView === "quota" ? quotaHTML : settingsHTML}<div class="foot">奶蛙桌宠 ${escape(state.version)} · 本地运行 · Asia / Shanghai</div></div>`;
  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        currentView = b.dataset.view!;
        renderPanel();
      }),
  );
  root.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((i) => {
    const key = i.dataset.setting!;
    if (i.type === "range") {
      let timer: ReturnType<typeof setTimeout>;
      i.oninput = () => {
        editingRange = true;
        const n = Number(i.value);
        const label = i.closest("label")?.querySelector("small");
        if (label)
          label.textContent =
            key === "size"
              ? `${Math.round((n / 160) * 100)}% · ${n} 像素`
              : `${Math.round(n * 100)}%`;
        clearTimeout(timer);
        timer = setTimeout(() => {
          void api.settings({ [key]: n });
        }, 30);
      };
      i.onchange = async () => {
        clearTimeout(timer);
        state = await api.settings({ [key]: Number(i.value) });
        editingRange = false;
        renderPanel();
      };
    } else
      i.onchange = async () => {
        state = await api.settings({ [key]: i.checked });
        renderPanel();
      };
  });
  root.querySelectorAll<HTMLButtonElement>("[data-size]").forEach(
    (b) =>
      (b.onclick = async () => {
        state = await api.settings({ size: Number(b.dataset.size) });
        renderPanel();
      }),
  );
  const refresh = document.getElementById(
    "refresh",
  ) as HTMLButtonElement | null;
  if (refresh)
    refresh.onclick = async () => {
      refresh.disabled = true;
      refresh.textContent = "正在读取…";
      state = await api.refresh();
      renderPanel();
    };
  const login = document.getElementById("login") as HTMLButtonElement | null;
  if (login)
    login.onclick = async () => {
      login.disabled = true;
      const r = await api.login();
      login.disabled = false;
      const note = document.getElementById("login-note");
      if (note)
        note.textContent = r.ok
          ? "请在浏览器完成 Codex 登录，完成后会自动刷新。"
          : r.error || "登录失败";
    };
  document
    .getElementById("pause")
    ?.addEventListener("click", () =>
      api.send(state.paused ? "resume-reminders" : "pause"),
    );
  document
    .getElementById("test-reminder")
    ?.addEventListener("click", () => api.send("test-reminder"));
  document.getElementById("test-sound")?.addEventListener("click", () => {
    const a = new Audio("../assets/laugh.mp3");
    a.volume = s.volume;
    a.play().catch(() => {});
  });
}
function duration(m: number) {
  if (m >= 1440) return `${Math.round(m / 1440)} 天窗口`;
  if (m >= 60) return `${Math.round((m / 60) * 10) / 10} 小时窗口`;
  return `${m} 分钟窗口`;
}
function updateBadge() {
  const badge = document.getElementById("quota-badge");
  if (!badge) return;
  badge.classList.toggle("hidden", !state.settings.quotaLabel);
  badge.classList.toggle("stale", !state.quota.connected);
  const valid = state.quota.windows.filter((w) => w.remaining !== null);
  const prefix = state.settings.size < 120 ? "额度" : "Codex 剩余";
  badge.textContent = valid.length
    ? `${prefix} ${Math.round(Math.min(...valid.map((w) => w.remaining!)))}%${state.quota.connected ? "" : " · 未更新"}`
    : state.quota.error
      ? "额度未连接"
      : "正在读取额度…";
}
async function bootPet() {
  await mountPet(root, api, () => state, updateBadge);
}
boot().catch((e) => {
  root.textContent = "奶蛙启动失败：" + String(e);
});
