import { promises as fs } from "node:fs";
import path from "node:path";
import { ExecutionResult } from "./execute.js";

export type IdempotencyEntry = {
  idempotencyKey: string;
  workflowId: string;
  agentId: string;
  permissionId: string;
  createdAt: string;
  response: ExecutionResult;
};

export class IdempotencyStore {
  private filePath: string;
  private cache = new Map<string, IdempotencyEntry>();
  private ready: Promise<void>;

  constructor(config: { filePath: string }) {
    this.filePath = config.filePath;
    this.ready = this.loadFromDisk();
  }

  async get(key: string): Promise<IdempotencyEntry | undefined> {
    await this.ready;
    return this.cache.get(key);
  }

  async set(entry: IdempotencyEntry): Promise<void> {
    await this.ready;
    this.cache.set(entry.idempotencyKey, entry);
    await this.ensureDir();
    await fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, "utf8");
      const lines = data.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          const entry = JSON.parse(line) as IdempotencyEntry;
          if (entry?.idempotencyKey && entry?.response) {
            this.cache.set(entry.idempotencyKey, entry);
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : "";
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  private async ensureDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (dir.length > 0) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}
