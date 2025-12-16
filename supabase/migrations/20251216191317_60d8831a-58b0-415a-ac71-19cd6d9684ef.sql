-- Remove duplicate CRON job (keep only gmail-sync-every-5-min)
SELECT cron.unschedule('gmail-sync-job');