-- Create gmail_sync_state table for persistent tracking
CREATE TABLE public.gmail_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  last_history_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gmail_sync_state ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage sync state" 
ON public.gmail_sync_state 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Insert initial row with current timestamp
INSERT INTO public.gmail_sync_state (last_sync_at) VALUES (now());