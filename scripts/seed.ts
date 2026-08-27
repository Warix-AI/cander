#!/usr/bin/env node
/**
 * Staging seed helper — inserts demo workspaces + org members.
 *
 * Usage (requires Supabase CLI + linked project):
 *   supabase db reset          # applies migrations + supabase/seed.sql
 *
 * Or apply seed only:
 *   supabase db execute --file supabase/seed.sql
 *
 * Local dev without Supabase continues to use lib/data.ts via DATA_BACKEND=local.
 */

console.log(`Cander Supabase seed
==================
Demo data lives in supabase/seed.sql (workspaces + org_members).

Recommended:
  supabase link --project-ref <ref>
  supabase db reset

Local mock mode (no Postgres):
  NEXT_PUBLIC_DATA_BACKEND=local npm run dev
`);
