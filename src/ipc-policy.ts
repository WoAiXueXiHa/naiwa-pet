/** Only the main frame of an application-owned webContents may call IPC. */
export function trustedSender(
  sender: unknown,
  frame: unknown,
  mainFrame: unknown,
  owners: unknown[],
): boolean {
  return frame != null && frame === mainFrame && owners.includes(sender);
}
