import type { SchedulerAdapter } from "@/lib/providers/interfaces";
import type { EnqueueResult } from "@/lib/providers/types";
import {
  InProcessSchedulerAdapter,
  type InProcessSchedulerOptions,
} from "@/lib/scheduling/in-process-scheduler";
import { assertMockProvidersAllowed } from "./assert-mock";

export type MockSchedulerOptions = InProcessSchedulerOptions;

/**
 * Mock scheduler — same enqueue counting as in-process, but refuses production.
 */
export class MockSchedulerAdapter implements SchedulerAdapter {
  private readonly inner: InProcessSchedulerAdapter;

  constructor(options: MockSchedulerOptions = {}) {
    assertMockProvidersAllowed("MockSchedulerAdapter");
    this.inner = new InProcessSchedulerAdapter(options);
  }

  enqueueDueReports(now: Date): Promise<EnqueueResult> {
    return this.inner.enqueueDueReports(now);
  }
}
