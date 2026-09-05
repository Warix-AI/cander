-- Enable Google Drive for Composio OAuth (was disabled in 039 catalog harden).

insert into public.connector_catalog
  (id, name, category, description, icon, scope, featured, actions, panel_type,
   display_order, enabled, coming_soon, provider_toolkit_id)
values
  (
    'gdrive',
    'Google Drive',
    'Productivity',
    'Find, open, create, and share files',
    'gdrive',
    'public',
    true,
    '["List","Search","Open","Create","Share"]'::jsonb,
    'generic',
    8,
    true,
    false,
    'googledrive'
  )
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  icon = excluded.icon,
  featured = excluded.featured,
  actions = excluded.actions,
  panel_type = excluded.panel_type,
  display_order = excluded.display_order,
  enabled = true,
  coming_soon = false,
  provider_toolkit_id = 'googledrive';
