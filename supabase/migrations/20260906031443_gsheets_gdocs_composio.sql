-- Enable Google Sheets and Google Docs for Composio OAuth.

insert into public.connector_catalog
  (id, name, category, description, icon, scope, featured, actions, panel_type,
   display_order, enabled, coming_soon, provider_toolkit_id)
values
  (
    'gsheets',
    'Google Sheets',
    'Productivity',
    'Read, update, and search spreadsheets',
    'gsheets',
    'public',
    true,
    '["Read","Update","Search"]'::jsonb,
    'generic',
    9,
    true,
    false,
    'googlesheets'
  ),
  (
    'gdocs',
    'Google Docs',
    'Productivity',
    'Read, draft, and search documents',
    'gdocs',
    'public',
    true,
    '["Read","Draft","Search"]'::jsonb,
    'generic',
    10,
    true,
    false,
    'googledocs'
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
  provider_toolkit_id = excluded.provider_toolkit_id;
