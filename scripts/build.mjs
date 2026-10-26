import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/main.cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/preload.cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/renderer.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: "dist/renderer.js",
});
await Promise.all(
  ["index.html", "style.css"].map((f) => copyFile("src/" + f, "dist/" + f)),
);
