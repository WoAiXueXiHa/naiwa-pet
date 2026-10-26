import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
// Report filenames and rule names only, never matched secret values.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = [];
for (const file of files) {
  if (statSync(file).size >= 100 * 1024 * 1024)
    findings.push([file, "oversize"]);
  if (/(^|\/)(auth\.json|settings\.json|\.env|credentials[^/]*)$/.test(file))
    findings.push([file, "private-file"]);
  if (!/\.(ts|mjs|json|md|py|html|css)$/.test(file)) continue;
  const value = readFileSync(file, "utf8");
  if (
    /(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,})/.test(
      value,
    )
  )
    findings.push([file, "credential"]);
  if (
    !file.startsWith("tests/") &&
    /[A-Z]:[\\/]Users[\\/](?!Public\b|Default\b|<)[^\s\\/"']+/i.test(value)
  )
    findings.push([file, "personal-path"]);
}
for (const [file, rule] of findings) console.error(`${rule}: ${file}`);
console.log(
  `Privacy checks: ${files.length} tracked files; ${findings.length} findings. Binary media needs separate review.`,
);
process.exitCode = findings.length ? 1 : 0;
