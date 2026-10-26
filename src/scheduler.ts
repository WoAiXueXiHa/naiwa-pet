export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private readonly tick: () => void,
    private readonly intervalMs = 15000,
  ) {}
  start() {
    if (!this.timer) this.timer = setInterval(this.tick, this.intervalMs);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
