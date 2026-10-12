/**
 * Live progress of a pipeline run, persisted to pipeline_runs.progress_json so the dashboard can show
 * what is happening on the backend. The pipeline is a per-article funnel with bounded concurrency, so
 * each stage is a counter pair (done / total) that is fed as items pass through it.
 */
export type StageKey = "sources" | "prefilter" | "classify" | "filters" | "research" | "scoring" | "contacts" | "drafts";
export type StageStatus = "pending" | "running" | "done" | "skipped" | "failed";

export const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: "sources", label: "Discover articles", hint: "Poll the funding-news feeds and store new articles" },
  { key: "prefilter", label: "Age & keyword gates", hint: "Drop stale or obviously unrelated articles (no AI cost)" },
  { key: "classify", label: "Classify with Gemini", hint: "Is it a funding round? Which company, stage, amount, investors" },
  { key: "filters", label: "Hard filters & dedupe", hint: "India, stage, age; merge repeat coverage into one funding event" },
  { key: "research", label: "Research", hint: "Company website + web research, structured profile" },
  { key: "scoring", label: "Fit scoring", hint: "Score against the active thesis; the app computes the total" },
  { key: "contacts", label: "Contact discovery", hint: "Find published founder / company emails" },
  { key: "drafts", label: "Outreach drafts", hint: "Personalised draft for each qualified startup" },
];

export interface StageProgress {
  key: StageKey;
  label: string;
  hint: string;
  status: StageStatus;
  done: number;
  total: number;
  detail: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ProgressSnapshot {
  stages: StageProgress[];
  /** One-line description of what the pipeline is doing right now. */
  activity: string | null;
  updatedAt: string;
}

export type ProgressWriter = (snapshot: ProgressSnapshot) => Promise<void>;

export class ProgressTracker {
  private readonly stages = new Map<StageKey, StageProgress>();
  private activity: string | null = null;
  private lastWrite = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private disabled = false;

  constructor(
    private readonly writer: ProgressWriter,
    private readonly now: () => number = Date.now,
    private readonly minIntervalMs = 1000,
  ) {
    for (const s of STAGES) this.stages.set(s.key, { ...s, status: "pending", done: 0, total: 0, detail: null, startedAt: null, finishedAt: null });
  }

  private get(key: StageKey): StageProgress {
    return this.stages.get(key)!;
  }

  private begin(s: StageProgress) {
    if (s.status === "pending") {
      s.status = "running";
      s.startedAt = new Date(this.now()).toISOString();
    }
  }

  /** Begin a stage with a known number of items. */
  start(key: StageKey, total = 0, detail: string | null = null) {
    const s = this.get(key);
    this.begin(s);
    s.total = total;
    if (detail) s.detail = detail;
    this.touch();
  }

  /** Another item entered the stage (stages downstream of the funnel grow as articles arrive). */
  add(key: StageKey, n = 1) {
    const s = this.get(key);
    this.begin(s);
    s.total += n;
    this.touch();
  }

  tick(key: StageKey, n = 1, detail?: string) {
    const s = this.get(key);
    this.begin(s);
    s.done += n;
    if (s.done > s.total) s.total = s.done;
    if (detail !== undefined) s.detail = detail;
    this.touch();
  }

  setDetail(key: StageKey, detail: string | null) {
    this.get(key).detail = detail;
    this.touch();
  }

  setActivity(message: string | null) {
    this.activity = message;
    this.touch();
  }

  /** Close a stage. A stage that never received an item is shown as skipped ("nothing to do"). */
  finish(key: StageKey, detail?: string) {
    const s = this.get(key);
    if (s.status === "done" || s.status === "skipped" || s.status === "failed") return;
    s.status = s.total === 0 && s.done === 0 ? "skipped" : "done";
    s.finishedAt = new Date(this.now()).toISOString();
    if (detail !== undefined) s.detail = detail;
    this.touch();
  }

  /** Wrap one item's work in a stage: counts it in, runs it, counts it out (even on error). */
  async track<T>(key: StageKey, activity: string, fn: () => Promise<T>): Promise<T> {
    this.add(key);
    this.setActivity(activity);
    try {
      return await fn();
    } finally {
      this.tick(key);
    }
  }

  /** End of run: close everything still open. On failure the stage that was running is marked failed. */
  finishAll(outcome: "completed" | "failed") {
    for (const s of this.stages.values()) {
      if (s.status === "running") {
        if (outcome === "failed") {
          s.status = "failed";
          s.finishedAt = new Date(this.now()).toISOString();
        } else this.finish(s.key);
      } else if (s.status === "pending") {
        s.status = "skipped";
        s.finishedAt = new Date(this.now()).toISOString();
      }
    }
    this.activity = outcome === "failed" ? "Run failed (see the error list below)" : "Run finished";
    this.touch();
  }

  snapshot(): ProgressSnapshot {
    return { stages: STAGES.map((d) => ({ ...this.get(d.key) })), activity: this.activity, updatedAt: new Date(this.now()).toISOString() };
  }

  private touch() {
    if (this.disabled) return;
    const wait = this.minIntervalMs - (this.now() - this.lastWrite);
    if (wait <= 0) void this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, wait);
      (this.timer as { unref?: () => void }).unref?.();
    }
  }

  /** Persist now. A failing writer (e.g. the column is not migrated yet) disables progress without affecting the run. */
  flush(): Promise<void> {
    if (this.disabled) return this.chain;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lastWrite = this.now();
    this.chain = this.chain
      .then(() => (this.disabled ? undefined : this.writer(this.snapshot())))
      .catch((err) => {
        this.disabled = true;
        console.warn("pipeline progress disabled:", err instanceof Error ? err.message : String(err));
      });
    return this.chain;
  }
}

/** Overall completion 0-100: finished/skipped stages count fully, running stages by their own ratio. */
export function overallPercent(snapshot: Pick<ProgressSnapshot, "stages">): number {
  const stages = snapshot.stages;
  if (!stages.length) return 0;
  const sum = stages.reduce((acc, s) => {
    if (s.status === "done" || s.status === "skipped") return acc + 1;
    if (s.status === "running") return acc + (s.total > 0 ? Math.min(0.95, s.done / s.total) : 0.05);
    return acc;
  }, 0);
  return Math.round((sum / stages.length) * 100);
}
