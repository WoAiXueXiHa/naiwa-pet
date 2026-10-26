import type { Manifest } from "./types";
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validateManifest(value: unknown): Manifest {
  if (
    !object(value) ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width < 1 ||
    value.height < 1 ||
    value.width > 4096 ||
    value.height > 4096 ||
    !object(value.animations)
  )
    throw new Error("动画清单格式无效");
  const valid = (clip: any) =>
    object(clip) &&
    Array.isArray(clip.frames) &&
    clip.frames.length > 0 &&
    Number.isFinite(clip.fps) &&
    clip.fps > 0 &&
    typeof clip.loop === "boolean" &&
    clip.frames.every(
      (f: any) =>
        object(f) &&
        typeof f.file === "string" &&
        /^[a-zA-Z0-9_./-]+$/.test(f.file) &&
        !f.file.split("/").includes("..") &&
        !f.file.startsWith("/") &&
        (f.durationMs === undefined ||
          (Number.isFinite(f.durationMs) && f.durationMs > 0)) &&
        (f.eyes === undefined ||
          (Array.isArray(f.eyes) &&
            f.eyes.every(
              (r: any) =>
                Array.isArray(r) &&
                r.length === 4 &&
                r.every((n: any) => Number.isFinite(n) && n >= 0 && n <= 1),
            ))),
    );
  for (const key of ["idle", "run-left", "laugh", "glance"])
    if (!valid(value.animations[key]))
      throw new Error("核心动画清单无效：" + key);
  const bridges = Object.fromEntries(
    Object.entries(object(value.bridges) ? value.bridges : {}).filter(
      ([, clip]) => valid(clip),
    ),
  );
  const animations = Object.fromEntries(
    Object.entries(value.animations).filter(([, clip]) => valid(clip)),
  );
  return { ...value, animations, bridges } as Manifest;
}
