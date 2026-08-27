-- Optional staging seed — run after migrations 001–006
-- supabase db reset loads this when seed.sql is configured

insert into public.workspaces (id, name, kind, personal, spaces, budget, spend)
values
  (
    'marketing',
    'Marketing',
    'business',
    false,
    array['work', 'build', 'studio', 'research', 'personal', 'connectors']::text[],
    '$2,400',
    '$1,820'
  ),
  (
    'engineering',
    'Engineering',
    'business',
    false,
    array['work', 'build', 'research', 'personal', 'connectors']::text[],
    '$3,200',
    '$2,410'
  ),
  (
    'operations',
    'Operations',
    'business',
    false,
    array['work', 'research', 'personal', 'connectors']::text[],
    '$1,200',
    '$890'
  )
on conflict (id) do nothing;

-- Demo org roster (profile_id null until real invites)
insert into public.org_members
  (id, email, name, short_name, initials, role, plan, seat_status, kind, workspace_ids)
values
  (
    'm1',
    'matthew@acme.com',
    'Matthew Gross',
    'Matthew',
    'MG',
    'Owner',
    'max',
    'active',
    'org',
    array['marketing', 'engineering', 'operations']::text[]
  ),
  (
    'm2',
    'ava@acme.com',
    'Ava Chen',
    'Ava',
    'AC',
    'Admin',
    'max',
    'active',
    'org',
    array['marketing', 'engineering', 'operations']::text[]
  )
on conflict (id) do nothing;
