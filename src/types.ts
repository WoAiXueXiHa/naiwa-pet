export interface Settings {
  size: number;
  sound: boolean;
  volume: number;
  quotaLabel: boolean;
  quotaReminders: boolean;
  breakReminders: boolean;
  alwaysOnTop: boolean;
  pausedUntil: number;
  x?: number;
  y?: number;
}
export interface QuotaWindow {
  key: string;
  name: string;
  remaining: number | null;
  durationMins: number | null;
  resetsAt: number | null;
}
export interface QuotaState {
  windows: QuotaWindow[];
  account: string;
  accountId: string;
  updatedAt: number | null;
  error: string | null;
  connected: boolean;
}
export type PetAction =
  | "idle"
  | "run-right"
  | "run-left"
  | "laugh"
  | "glance"
  | "stretch";
export interface PetFrame {
  file: string;
  durationMs?: number;
  eyes?: [number, number, number, number][];
  body?: [number, number, number, number];
}
export interface PetAnimation {
  frames: PetFrame[];
  fps: number;
  loop: boolean;
}
export interface Manifest {
  width: number;
  height: number;
  animations: Record<PetAction, PetAnimation>;
  bridges?: Record<string, PetAnimation>;
}
export interface Snapshot {
  settings: Settings;
  quota: Omit<QuotaState, "accountId">;
  version: string;
  paused: boolean;
}

export interface PetApi {
  snapshot(): Promise<Snapshot>;
  settings(patch: Partial<Settings>): Promise<Snapshot>;
  refresh(): Promise<Snapshot>;
  login(): Promise<{ ok: boolean; error?: string }>;
  send(
    name:
      | "panel"
      | "context"
      | "hit"
      | "drag-start"
      | "drag-stop"
      | "pause"
      | "resume-reminders"
      | "snooze"
      | "hide"
      | "online"
      | "test-reminder",
    data?: unknown,
  ): void;
  on(
    name: "snapshot" | "bubble" | "drag-motion" | "view",
    callback: (data: any) => void,
  ): () => void;
}
