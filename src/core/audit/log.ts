/**
 * Audit trail primitives.
 *
 * Requirement §8/§10: log every tool call with agent ID, timestamp, input hash,
 * output summary and success/error state, and keep the trace replayable from
 * recorded inputs. An `AuditSink` is any collector of `AuditEntry` records; the
 * orchestrator uses an in-memory sink per session and serialises it into the
 * experiment/trace record.
 */

export interface AuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  tool: string;
  permission: string;
  inputHash: string;
  /** Full structured input — enables deterministic replay. */
  input: unknown;
  outputHash?: string;
  /** Compact human-readable summary of the output. */
  outputSummary?: string;
  status: "ok" | "error";
  errorCode?: string;
  durationMs: number;
}

export interface AuditSink {
  record(entry: AuditEntry): void;
  entries(): AuditEntry[];
}

export class InMemoryAuditSink implements AuditSink {
  private readonly log: AuditEntry[] = [];
  record(entry: AuditEntry): void {
    this.log.push(entry);
  }
  entries(): AuditEntry[] {
    return [...this.log];
  }
  clear(): void {
    this.log.length = 0;
  }
}

let auditCounter = 0;
export function nextAuditId(): string {
  auditCounter += 1;
  return `audit_${auditCounter.toString(36).padStart(6, "0")}`;
}
