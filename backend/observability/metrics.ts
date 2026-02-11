export class MetricsStore {
  private counters = new Map<string, number>();

  increment(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  toPrometheus(): string {
    const lines: string[] = [];
    for (const [key, value] of this.counters.entries()) {
      lines.push(`# TYPE ${key} counter`);
      lines.push(`${key} ${value}`);
    }
    return `${lines.join("\n")}\n`;
  }
}
