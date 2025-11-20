import type { SupabaseClient } from "@supabase/supabase-js";

export async function edgeInvoke<T>(
  supabase: SupabaseClient, 
  name: string, 
  body: any
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || "Edge function failed");
  if (!data?.ok) throw new Error(data?.error || "Edge function returned error");
  return data.data as T;
}

export async function withRetry<T>(
  fn: () => Promise<T>, 
  attempts = 1, 
  delayMs = 700
): Promise<T> {
  try { 
    return await fn(); 
  } catch (e) {
    if (attempts <= 0) throw e;
    await new Promise(r => setTimeout(r, delayMs));
    return withRetry(fn, attempts - 1, delayMs);
  }
}
