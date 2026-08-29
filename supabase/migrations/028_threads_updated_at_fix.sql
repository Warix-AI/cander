-- Stop stomping client-provided threads.updated_at on every UPDATE.
-- Recents sync was upserting all threads; the old BEFORE UPDATE trigger
-- forced updated_at = now() on each row, flattening every chat to "Just now".
-- Message inserts still bump via touch_thread_on_message; the client also
-- sends ISO updated_at on intentional thread writes.

drop trigger if exists threads_updated_at on public.threads;
