# Chat privacy

## Private AI (`ai_chats`, `ai_chat_messages`, `ai_chat_context_refs`)

- Owner-only RLS (`owner_id = auth.uid()`).
- Edge `ai-chat` also filters by `owner_id`.
- Workspace inventory is scoped to authorized workspace refs; projects/sources use member RLS (no cross-workspace leak).

## UI transcript (`threads`, `messages`)

- As of migration `027_chat_owner_private.sql`, threads and messages are **owner-private**.
- Migration `057_chat_threads_membership_tighten.sql` requires `is_workspace_member(workspace_id)` on UPDATE/DELETE so owners cannot reassign threads off a membership.
- Co-members of a shared workspace see projects/sources (when the workspace is shared); they do **NOT** see each other’s chats.
- `created_by` must be set on insert (client + RLS check).
- Legacy `threads.shared` is unused for access control (always written `false`).

## Projects / apps / websites

- Same `projects` table (`kind`: app | site | …).
- Access: workspace member **and** (`created_by = auth.uid()` **or** `is_shared_workspace(workspace_id)`).
- Shared workspace = `kind = 'business'` **or** member count ≥ 2 (`058`).

## Recents

- Indexes only threads with real turns and `createdBy ===` current actor (defense in depth).
