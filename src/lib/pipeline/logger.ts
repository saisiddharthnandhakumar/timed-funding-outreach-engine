import { db } from "@/lib/supabase/admin";

/** Writes pipeline_events rows; logging must never break the pipeline. */
export class PipelineLogger {
  constructor(readonly runId: string | null) {}

  async event(entityType: string, entityId: string | null, eventType: string, message: string, metadata?: Record<string, unknown>) {
    try {
      await db().from("pipeline_events").insert({
        pipeline_run_id: this.runId,
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        message,
        metadata_json: metadata ?? null,
      });
    } catch {
      /* swallow: observability is best-effort */
    }
  }
}
