import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { DEFAULT_SETTINGS, sanitizeSettings } from "./rules";
import type { Settings } from "./types";
import { petWindowSize } from "./windows";
export interface StoredState {
  settings: Settings;
  seen: Record<string, boolean>;
  lastBreak: string;
}
export function loadState(path: string): StoredState {
  const fallback = (): StoredState => ({
    settings: { ...DEFAULT_SETTINGS },
    seen: {},
    lastBreak: "",
  });
  if (!existsSync(path)) return fallback();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Invalid settings");
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      ...sanitizeSettings(raw.settings),
    };
    for (const key of ["x", "y"] as const)
      if (
        Number.isFinite(raw.settings?.[key]) &&
        Math.abs(raw.settings[key]) <= 2147483647
      )
        settings[key] = Math.round(raw.settings[key]);
    if (
      Number.isFinite(raw.settings?.pausedUntil) &&
      raw.settings.pausedUntil >= 0 &&
      raw.settings.pausedUntil <= 8640000000000000
    )
      settings.pausedUntil = raw.settings.pausedUntil;
    // Grow the transparent space above the pet while preserving its screen position.
    if (raw.windowLayoutVersion !== 2) {
      const width = petWindowSize(settings.size).width;
      if (settings.x !== undefined)
        settings.x -= Math.round(
          (width - Math.max(150, Math.round(settings.size * 1.4))) / 2,
        );
      if (settings.y !== undefined) settings.y -= 172;
    }
    const seen = Object.fromEntries(
      Object.entries(raw.seen && typeof raw.seen === "object" ? raw.seen : {})
        .filter(([k, v]) => k.length < 512 && v === true)
        .slice(-1000),
    ) as Record<string, boolean>;
    return {
      settings,
      seen,
      lastBreak:
        typeof raw.lastBreak === "string" &&
        /^\d{4}-\d{2}-\d{2}:\d{1,2}$/.test(raw.lastBreak)
          ? raw.lastBreak
          : "",
    };
  } catch {
    try {
      copyFileSync(path, path + ".corrupt-" + Date.now());
    } catch {}
    return fallback();
  }
}
export function saveState(path: string, state: StoredState): void {
  const temp = path + ".tmp";
  writeFileSync(
    temp,
    JSON.stringify({ ...state, windowLayoutVersion: 2 }, null, 2),
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  renameSync(temp, path);
}
