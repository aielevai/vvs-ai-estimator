// Shared HTTP utilities for edge functions
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function ok<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function err(e: unknown, status = 500, extra?: any) {
  const msg = e instanceof Error ? e.message : String(e);
  const details = extra?.details ?? (e instanceof Error ? { name: e.name, stack: e.stack } : undefined);
  return new Response(JSON.stringify({ ok: false, error: msg, details }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function handleOptions() {
  return new Response("ok", { headers: corsHeaders });
}

// Normalize customer_supplied to array<string>
export function normalizeCustomerSupplied(input: unknown): string[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    return Object.entries(input as Record<string, boolean>)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }
  return [];
}
