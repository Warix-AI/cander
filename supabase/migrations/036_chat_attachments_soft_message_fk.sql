-- Soften message_id FK: UI messages may exist locally before sync.
-- Pending attachments must link to client message ids without failing.

do $$
declare
  fk_name text;
begin
  select tc.constraint_name into fk_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'chat_attachments'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'message_id'
  limit 1;
  if fk_name is not null then
    execute format(
      'alter table public.chat_attachments drop constraint %I',
      fk_name
    );
  end if;
end $$;
