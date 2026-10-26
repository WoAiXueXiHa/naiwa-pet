export function redact(value: unknown): string {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[account hidden]")
    .replace(/[A-Z]:[\\/][^\r\n"<>]*/gi, "[local path]")
    .replace(/\b(?:sk-[\w-]+|Bearer\s+[^\s]+)/gi, "[credential hidden]");
}
export function maskAccount(email: unknown): string {
  return typeof email === "string" && email.includes("@")
    ? email.slice(0, 1) + "***@***"
    : "ChatGPT";
}
