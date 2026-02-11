import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type AuditRecord = {
  recordId: string;
  workflowId: string;
  agentId: string;
  event: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

export class AuditLedger {
  private filePath: string;

  constructor(config: { filePath: string }) {
    this.filePath = config.filePath;
  }

  async append(
    record: Omit<AuditRecord, "recordId" | "timestamp"> & { timestamp?: string }
  ): Promise<AuditRecord> {
    const recordId = crypto.randomUUID();
    const timestamp = record.timestamp ?? new Date().toISOString();
    const fullRecord: AuditRecord = {
      recordId,
      timestamp,
      workflowId: record.workflowId,
      agentId: record.agentId,
      event: record.event,
      data: record.data
    };

    const dir = path.dirname(this.filePath);
    if (dir.length > 0) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.appendFile(this.filePath, `${JSON.stringify(fullRecord)}\n`, "utf8");
    return fullRecord;
  }
}
