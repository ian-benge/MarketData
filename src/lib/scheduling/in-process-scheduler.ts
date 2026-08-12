import type { SchedulerAdapter } from "@/lib/providers/interfaces";
import type { EnqueueResult } from "@/lib/providers/types";
import {
  buildIdempotencyKey,
  getDueEditions,
} from "@/lib/scheduling/chicago-schedule";

export type InProcessSchedulerOptions = {
  firmId?: string;
  graceMinutes?: number;
  existingKeys?: Set<string> | string[];
};

/**
 * Production-safe scheduler helper: computes due Chicago editions and returns
 * enqueue counts without persisting. Persistence is handled by the job layer.
 */
export class InProcessSchedulerAdapter implements SchedulerAdapter {
  private readonly firmId: string;
  private readonly graceMinutes: number;
  private readonly existingKeys: Set<string>;

  constructor(options: InProcessSchedulerOptions = {}) {
    this.firmId = options.firmId ?? "default";
    this.graceMinutes = options.graceMinutes ?? 15;
    this.existingKeys = new Set(options.existingKeys ?? []);
  }

  async enqueueDueReports(now: Date): Promise<EnqueueResult> {
    const due = getDueEditions(now, this.graceMinutes, this.firmId);
    const notes: string[] = [];
    const idempotencyKeys: string[] = [];
    const editions: EnqueueResult["editions"] = [];
    let enqueued = 0;
    let skipped = 0;

    for (const item of due) {
      const key =
        item.idempotencyKey ||
        buildIdempotencyKey(item.tradingDate, item.edition, this.firmId);
      if (this.existingKeys.has(key)) {
        skipped += 1;
        notes.push(`skip duplicate ${key}`);
        continue;
      }
      this.existingKeys.add(key);
      enqueued += 1;
      idempotencyKeys.push(key);
      editions.push(item.edition);
      notes.push(`enqueue ${key}`);
    }

    if (due.length === 0) {
      notes.push("no editions due (weekend/holiday or outside grace window)");
    }

    return {
      considered: due.length,
      enqueued,
      skipped,
      idempotencyKeys,
      editions,
      tradingDate: due[0]?.tradingDate,
      notes,
    };
  }
}
