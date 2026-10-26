import { validateManifest } from "./manifest";
import type {
  Manifest,
  PetAction,
  PetAnimation,
  PetFrame,
  Snapshot,
} from "./types";
type Api = Window["naiwa"];
type Bridge = {
  clip: PetAnimation;
  started: number;
  mirror: boolean;
  done: () => void;
};
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function mountPet(
  root: HTMLElement,
  api: Api,
  getState: () => Snapshot,
  updateBadge: () => void,
) {
  root.innerHTML =
    '<div class="pet-stage"><div class="bubble hidden" id="bubble"></div><canvas id="pet" aria-label="奶蛙：短按眼睛侧目，身体大笑，任意方向拖动，Ctrl加滚轮调整大小"></canvas><button class="badge" id="quota-badge">正在读取额度…</button></div>';
  let manifest: Manifest;
  try {
    manifest = validateManifest(
      await (await fetch("../assets/manifest.json")).json(),
    );
  } catch {
    root.textContent = "动画素材未找到，请检查 assets 文件夹。";
    return;
  }
  const canvas = document.getElementById("pet") as HTMLCanvasElement,
    ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  canvas.width = manifest.width;
  canvas.height = manifest.height;
  const images = new Map<string, HTMLImageElement>(),
    loading = new Map<string, Promise<void>>(),
    bridgeLru: string[] = [];
  function ensure(file: string) {
    if (images.get(file)?.complete) return Promise.resolve();
    if (loading.has(file)) return loading.get(file)!;
    const p = new Promise<void>((resolve) => {
      const i = new Image();
      images.set(file, i);
      const timer = setTimeout(() => {
        i.onload = null;
        i.onerror = null;
        resolve();
      }, 10000);
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      i.onload = finish;
      i.onerror = finish;
      i.src = "../assets/" + file;
    });
    loading.set(file, p);
    p.finally(() => loading.delete(file));
    return p;
  }
  await Promise.all(
    [
      ...new Set(
        Object.values(manifest.animations).flatMap((a) =>
          a.frames.map((f) => f.file),
        ),
      ),
    ].map(ensure),
  );
  if (
    Object.values(manifest.animations).some((a) =>
      a.frames.some((f) => !images.get(f.file)?.naturalWidth),
    )
  ) {
    root.textContent = "核心动画素材损坏或缺失，请重新安装完整素材。";
    return;
  }
  const canonical = (a: PetAction): PetAction =>
    a === "run-right" ? "run-left" : a === "stretch" ? "idle" : a;
  const clipFor = (a: PetAction) => manifest.animations[canonical(a)];
  const timeline = (a: PetAnimation) => {
    let t = 0;
    return a.frames.map((f) => (t += f.durationMs || 1000 / a.fps));
  };
  const timelines = new Map<PetAnimation, number[]>();
  const times = (a: PetAnimation) => {
    if (!timelines.has(a)) timelines.set(a, timeline(a));
    return timelines.get(a)!;
  };
  function at(clip: PetAnimation, elapsed: number) {
    const ends = times(clip),
      total = ends.at(-1)!;
    const t = clip.loop ? elapsed % total : Math.min(elapsed, total - 0.001);
    const index = Math.max(
      0,
      ends.findIndex((e) => t < e),
    );
    return { index, frame: clip.frames[index], total, ended: elapsed >= total };
  }
  let action: PetAction = "idle",
    wanted: PetAction = "idle",
    frameIndex = 0,
    facingRight = false,
    phase = 0,
    lastTick = performance.now();
  let bridge: Bridge | null = null,
    loadingBridge = false,
    bridgeToken = 0,
    shown: PetFrame = clipFor("idle").frames[0],
    shownMirror = false,
    lastPaint = "";
  let cadence = 1,
    targetCadence = 1,
    isDragging = false,
    down: { sx: number; sy: number; eye: boolean } | null = null,
    lastHit = true;
  let bubbleTimer: ReturnType<typeof setTimeout>;
  const audio = new Audio("../assets/laugh.mp3");
  audio.preload = "auto";
  audio.loop = false;
  function start(a: PetAction, index = 0) {
    action = a;
    frameIndex = index;
    phase = index ? times(clipFor(a))[index - 1] : 0;
    lastTick = performance.now();
    lastPaint = "";
    if (a === "laugh" && getState().settings.sound) {
      audio.currentTime = 0;
      audio.volume = getState().settings.volume;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }
  async function begin(key: string, done: () => void) {
    const clip = manifest.bridges?.[key];
    if (!clip) {
      done();
      pump();
      return;
    }
    loadingBridge = true;
    const token = ++bridgeToken;
    await Promise.all(clip.frames.map((f) => ensure(f.file)));
    if (token !== bridgeToken) return;
    if (clip.frames.some((f) => !images.get(f.file)?.naturalWidth)) {
      loadingBridge = false;
      done();
      pump();
      return;
    }
    const protectedFiles = new Set(clip.frames.map((f) => f.file));
    for (const f of protectedFiles) {
      const old = bridgeLru.indexOf(f);
      if (old >= 0) bridgeLru.splice(old, 1);
      bridgeLru.push(f);
    }
    while (bridgeLru.length > 48) {
      const f = bridgeLru.shift()!;
      if (!protectedFiles.has(f)) images.delete(f);
    }
    loadingBridge = false;
    bridge = { clip, started: performance.now(), mirror: facingRight, done };
    lastPaint = "";
  }
  function exitGate(a: PetAction, index: number) {
    const prefix = canonical(a) + ":";
    const gates = Object.keys(manifest.bridges || {})
      .filter((k) => k.startsWith(prefix) && k.endsWith(">idle"))
      .map((k) => Number(k.slice(prefix.length).split(">")[0]))
      .sort((a, b) => a - b);
    return gates.find((g) => g >= index) ?? gates.at(-1) ?? index;
  }
  function pump() {
    if (bridge || loadingBridge) return;
    if (action === "stretch") action = "idle";
    if (action === wanted) return;
    const running = action === "run-left" || action === "run-right";
    const wantsRun = wanted === "run-left" || wanted === "run-right";
    if (action === "idle") {
      if (wantsRun && (wanted === "run-right") !== facingRight) {
        void begin("idle:0>turn", () => {
          facingRight = !facingRight;
          lastPaint = "";
        });
        return;
      }
      const next = wanted;
      void begin(`idle:0>${canonical(next)}`, () => start(next));
      return;
    }
    if (running && wantsRun) {
      if (frameIndex !== 0) return;
      const next = wanted;
      void begin("run-left:0>turn", () => {
        facingRight = next === "run-right";
        start(next, 0);
      });
      return;
    }
    const gate = exitGate(action, frameIndex);
    if (frameIndex !== gate) return;
    const from = canonical(action);
    audio.pause();
    audio.currentTime = 0;
    void begin(`${from}:${frameIndex}>idle`, () => start("idle"));
  }
  function request(a: PetAction) {
    if (a === "stretch") a = "idle";
    wanted = a;
    canvas.dataset.action = a;
    pump();
  }
  audio.addEventListener("ended", () => {
    if (action === "laugh" && wanted === "laugh") request("idle");
  });
  function hit(e: MouseEvent) {
    const r = canvas.getBoundingClientRect(),
      rawX = ((e.clientX - r.left) / r.width) * canvas.width,
      y = ((e.clientY - r.top) / r.height) * canvas.height;
    if (rawX < 0 || y < 0 || rawX >= canvas.width || y >= canvas.height)
      return { body: false, eye: false };
    const x = shownMirror ? canvas.width - rawX : rawX;
    const regions = shown.eyes?.length
      ? shown.eyes
      : canonical(action) === "idle"
        ? clipFor("idle").frames[0].eyes
        : [];
    const eye = !!regions?.some(([a, b, c, d]) => {
      const cx = ((a + c) / 2) * canvas.width,
        cy = ((b + d) / 2) * canvas.height;
      return (
        Math.abs(x - cx) <=
          Math.max(
            ((c - a) / 2) * canvas.width,
            (6 / r.width) * canvas.width,
          ) &&
        Math.abs(y - cy) <=
          Math.max(
            ((d - b) / 2) * canvas.height,
            (6 / r.height) * canvas.height,
          )
      );
    });
    const alpha = ctx.getImageData(Math.floor(rawX), Math.floor(y), 1, 1)
      .data[3];
    return { body: alpha > 35, eye: eye && alpha > 35 };
  }
  const hitState = (yes: boolean) => {
    if (yes !== lastHit) {
      lastHit = yes;
      api.send("hit", yes);
    }
  };
  window.addEventListener("mousemove", (e) => {
    if (!down)
      hitState(
        hit(e).body ||
          !!(e.target as HTMLElement).closest("button,.bubble:not(.hidden)"),
      );
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const h = hit(e);
    if (!h.body) return;
    down = { sx: e.screenX, sy: e.screenY, eye: h.eye };
    if (e.isTrusted) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!down || !(e.buttons & 1)) return;
    if (
      !isDragging &&
      Math.hypot(e.screenX - down.sx, e.screenY - down.sy) > 4
    ) {
      isDragging = true;
      canvas.dataset.dragging = "true";
      api.send("drag-start", { x: down.sx, y: down.sy });
    }
  });
  function release(e: PointerEvent) {
    if (!down) return;
    const old = down;
    down = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (isDragging) {
      isDragging = false;
      canvas.dataset.dragging = "false";
      api.send("drag-stop");
      request("idle");
    } else request(old.eye ? "glance" : "laugh");
  }
  canvas.addEventListener("pointerup", release);
  const cancel = () => {
    down = null;
    isDragging = false;
    canvas.dataset.dragging = "false";
    api.send("drag-stop");
    request("idle");
  };
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", () => {
    if (down) cancel();
  });
  window.addEventListener("blur", () => {
    if (down) cancel();
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey || down) return;
      e.preventDefault();
      const size = Math.max(
        40,
        Math.min(360, getState().settings.size + (e.deltaY < 0 ? 4 : -4)),
      );
      void api.settings({ size });
    },
    { passive: false },
  );
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    api.send("context");
  });
  document.getElementById("quota-badge")!.onclick = () =>
    api.send("panel", "quota");
  api.on("drag-motion", (data) => {
    if (!isDragging) return;
    const a: PetAction = typeof data === "string" ? data : data.action;
    if (typeof data === "object")
      targetCadence = Math.max(0.65, Math.min(1.75, (data.speed || 0) / 450));
    request(a);
  });
  api.on("bubble", ({ text, kind }) => {
    const el = document.getElementById("bubble")!;
    el.innerHTML =
      escape(text).replace(/\n/g, "<br>") +
      (kind === "break"
        ? '<br><button id="dismiss-break">知道了</button><button id="snooze-break">稍后 10 分钟</button>'
        : "");
    el.classList.remove("hidden");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(
      () => el.classList.add("hidden"),
      kind === "break" ? 25000 : 12000,
    );
    document
      .getElementById("dismiss-break")
      ?.addEventListener("click", () => el.classList.add("hidden"));
    document.getElementById("snooze-break")?.addEventListener("click", () => {
      api.send("snooze");
      el.classList.add("hidden");
    });
  });
  let disposed = false;
  window.addEventListener(
    "beforeunload",
    () => {
      disposed = true;
      bridgeToken++;
      clearTimeout(bubbleTimer);
      audio.pause();
      api.send("drag-stop");
    },
    { once: true },
  );
  function draw(now: number) {
    if (disposed) return;
    const dt = Math.min(100, now - lastTick);
    lastTick = now;
    if (bridge) {
      const sample = at(bridge.clip, now - bridge.started);
      shown = sample.frame;
      shownMirror = bridge.mirror;
      if (sample.ended) {
        const done = bridge.done;
        bridge = null;
        done();
        pump();
      }
    } else if (!loadingBridge) {
      const clip = clipFor(action);
      cadence += (targetCadence - cadence) * 0.12;
      phase +=
        dt * (action === "run-left" || action === "run-right" ? cadence : 1);
      if (action === "laugh" && getState().settings.sound && !audio.paused)
        phase = audio.currentTime * 1000;
      const sample = at(clip, phase);
      frameIndex = sample.index;
      shown = sample.frame;
      shownMirror = facingRight;
      if (sample.ended && !clip.loop && wanted === action) {
        wanted = "idle";
        canvas.dataset.action = "idle";
      }
      pump();
    }
    const key = shown.file + ":" + shownMirror;
    if (key !== lastPaint) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const im = images.get(shown.file);
      if (im?.complete && im.naturalWidth) {
        ctx.save();
        if (shownMirror) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      lastPaint = key;
    }
    canvas.dataset.frame = String(frameIndex);
    canvas.dataset.phase = bridge
      ? "transition"
      : loadingBridge
        ? "preparing"
        : action;
    canvas.dataset.facing = facingRight ? "right" : "left";
    const settings = getState().settings;
    root.style.setProperty("--pet-height", settings.size + "px");
    canvas.style.height = settings.size + "px";
    canvas.style.width =
      (settings.size * manifest.width) / manifest.height + "px";
    root.style.setProperty(
      "--badge-size",
      Math.max(8, Math.min(11, settings.size / 16)) + "px",
    );
    if (!settings.sound && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (!audio.paused) audio.volume = settings.volume;
    requestAnimationFrame(draw);
  }
  canvas.dataset.action = "idle";
  api.send("hit", false);
  lastHit = false;
  updateBadge();
  requestAnimationFrame(draw);
}
