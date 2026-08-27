import type { User } from "@supabase/supabase-js";
import type { Member } from "@/lib/types";
import { authDisplayName, authEmail } from "@/lib/supabase/auth-actions";

/** Build a Member-shaped row from Supabase Auth until org members load from DB (Phase 3). */
export function memberFromSupabaseUser(user: User): Member {
  const name = authDisplayName(user);
  const email = authEmail(user);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const short = name.split(" ")[0] ?? name;

  return {
    id: user.id,
    name,
    email,
    short,
    initials,
    role: "Owner",
    workspaceIds: [],
    plan: "free",
    seatStatus: "active",
    kind: "personal",
  };
}
