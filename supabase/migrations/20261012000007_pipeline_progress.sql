-- Live per-stage progress of a pipeline run, written by the run itself and polled by the dashboard.
alter table public.pipeline_runs add column progress_json jsonb;
