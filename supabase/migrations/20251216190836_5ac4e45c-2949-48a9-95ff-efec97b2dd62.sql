-- Enable pg_net extension for HTTP requests from pg_cron
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enable pg_cron extension (already exists, but ensure it's available)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Schedule gmail-sync to run every 5 minutes
SELECT cron.schedule(
  'gmail-sync-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xrvmjrrcdfvrhfzknlku.supabase.co/functions/v1/gmail-sync',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhydm1qcnJjZGZ2cmhmemtubGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MDMwMzgsImV4cCI6MjA3MzM3OTAzOH0.T3HjMBptCVyHB-lDc8Lnr3xLndurh3f6c38JLJ50fL0", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
