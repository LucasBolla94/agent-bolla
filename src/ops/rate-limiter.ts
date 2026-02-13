export class RateLimiter {
  private queue: Promise<void> = Promise.resolve();
  private lastRunAt = 0;

  constructor(
    private readonly label: string,
    private readonly minIntervalMs: number
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = this.queue;
    this.queue = previous.then(() => gate);
    await previous;

    try {
      const elapsed = Date.now() - this.lastRunAt;
      const waitMs = Math.max(0, this.minIntervalMs - elapsed);

      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const result = await task();
      this.lastRunAt = Date.now();
      return result;
    } finally {
      if (release) release();
    }
  }

  getName(): string {
    return this.label;
  }
}
