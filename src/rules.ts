import type { QuotaWindow } from "./types";
export const DEFAULT_SETTINGS = {
  size: 80,
  sound: true,
  volume: 0.55,
  quotaLabel: true,
  quotaReminders: true,
  breakReminders: true,
  alwaysOnTop: true,
  pausedUntil: 0,
};
export function beijingParts(time: number) {
  const d = new Date(time + 8 * 3600000);
  return {
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    date: d.toISOString().slice(0, 10),
  };
}
export function quotaHours(time: number) {
  const { hour } = beijingParts(time);
  return hour >= 9 && hour < 23;
}
export function breakDue(time: number) {
  const { hour, minute } = beijingParts(time);
  return (
    minute === 0 && hour >= 10 && hour <= 22 && ![12, 13, 18, 19].includes(hour)
  );
}
export function normalizeQuota(result: any): QuotaWindow[] {
  const buckets =
    result?.rateLimitsByLimitId &&
    typeof result.rateLimitsByLimitId === "object" &&
    !Array.isArray(result.rateLimitsByLimitId)
      ? result.rateLimitsByLimitId
      : null;
  const entries =
    buckets && Object.keys(buckets).length
      ? Object.entries(buckets)
      : [["codex", result?.rateLimits]];
  return entries.flatMap(([id, b]: any) => {
    if (!b || typeof b !== "object" || Array.isArray(b)) return [];
    return ["primary", "secondary"].flatMap((k) => {
      const w = b[k];
      if (!w || typeof w !== "object" || Array.isArray(w)) return [];
      return [
        {
          key: `${id}:${k}`,
          name: `${b.limitName || id} · ${k === "primary" ? "主窗口" : "次窗口"}`,
          remaining:
            typeof w.usedPercent === "number" && Number.isFinite(w.usedPercent)
              ? Math.max(0, Math.min(100, 100 - w.usedPercent))
              : null,
          durationMins:
            typeof w.windowDurationMins === "number" &&
            Number.isFinite(w.windowDurationMins) &&
            w.windowDurationMins > 0
              ? w.windowDurationMins
              : null,
          resetsAt:
            typeof w.resetsAt === "number" &&
            Number.isFinite(w.resetsAt) &&
            w.resetsAt > 0 &&
            w.resetsAt <= 8640000000000
              ? w.resetsAt * 1000
              : null,
        },
      ];
    });
  });
}
export function thresholdAlerts(
  account: string,
  windows: QuotaWindow[],
  seen: Record<string, boolean>,
) {
  const alerts: { window: QuotaWindow; threshold: number }[] = [];
  for (const w of windows) {
    if (w.remaining === null || w.resetsAt === null) continue;
    const reached = [20, 10, 5].filter((t) => w.remaining! <= t);
    const key = (t: number) => `${account}|${w.key}|${w.resetsAt}|${t}`;
    const fresh = reached.filter((t) => !seen[key(t)]);
    if (fresh.length) alerts.push({ window: w, threshold: Math.min(...fresh) });
    for (const t of reached) seen[key(t)] = true;
  }
  return alerts;
}
export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  area: { x: number; y: number; width: number; height: number },
) {
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
  };
}
export function sanitizeSettings(patch: any) {
  const out: Record<string, any> = {};
  for (const k of [
    "sound",
    "quotaLabel",
    "quotaReminders",
    "breakReminders",
    "alwaysOnTop",
  ])
    if (typeof patch?.[k] === "boolean") out[k] = patch[k];
  if (typeof patch?.size === "number" && Number.isFinite(patch.size))
    out.size = Math.round(Math.max(40, Math.min(360, patch.size)));
  if (typeof patch?.volume === "number" && Number.isFinite(patch.volume))
    out.volume = Math.max(0, Math.min(1, patch.volume));
  return out;
}
export function freeDragPosition(
  base: { x: number; y: number },
  origin: { x: number; y: number },
  current: { x: number; y: number },
) {
  return {
    x: Math.round(base.x + current.x - origin.x),
    y: Math.round(base.y + current.y - origin.y),
  };
}
export function dragFacing(
  dx: number,
  dy: number,
  last: "run-left" | "run-right",
) {
  return Math.abs(dx) >= Math.max(0.5, Math.abs(dy) * 0.2)
    ? dx < 0
      ? "run-left"
      : "run-right"
    : last;
}
