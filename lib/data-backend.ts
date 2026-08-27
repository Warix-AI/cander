export type DataBackend = "local" | "supabase";

/** True when Supabase URL + anon key are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Active data backend.
 * Live (localhost and production) uses Supabase whenever keys are set.
 * Pass NEXT_PUBLIC_DATA_BACKEND=local to force the mock catalog.
 */
export function getDataBackend(): DataBackend {
  const mode = process.env.NEXT_PUBLIC_DATA_BACKEND;
  if (mode === "local") return "local";
  if (isSupabaseConfigured()) return "supabase";
  return "local";
}
