# Chat privacy

## Private AI (`ai_chats`, `ai_chat_messages`, `ai_chat_context_refs`)

- Owner-only RLS (`owner_id = auth.uid()`).
- Edge `ai-chat` also filters by `owner_id`.
- Workspace inventory is scoped to authorized workspace refs; projects/sources use member RLS (no cross-workspace leak).

## UI transcript (`threads`, `messages`)

- As of migration `027_chat_owner_private.sql`, threads and messages are **owner-private**.
- Co-members of a shared workspace see projects/sources/etc., **not** each other’s chats.
- `created_by` must be set on insert (client + RLS check).

## Recents

- Indexes only threads with real turns and `createdBy ===` current actor (defense in depth).
