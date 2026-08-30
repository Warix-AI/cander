-- Fix: computer_sessions has no updated_at column; set_updated_at() trigger
-- caused every UPDATE (including control_mode) to fail silently for clients.

drop trigger if exists computer_sessions_updated_at on public.computer_sessions;
