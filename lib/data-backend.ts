export type DataBackend = "local" | "supabase";

/** True when Supabase URL + anon key are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Active data backend. Supabase requires env vars; otherwise local mock. */
export function getDataBackend(): DataBackend {
  const mode = process.env.NEXT_PUBLIC_DATA_BACKEND;
  if (mode === "supabase" && isSupabaseConfigured()) return "supabase";
  return "local";
}
