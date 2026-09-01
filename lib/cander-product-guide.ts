import { APP_NAME, APP_TAGLINE } from "@/lib/app-brand";

/** Plain-language product reference for help / navigation questions. */
export const CANDER_PRODUCT_GUIDE = `${APP_NAME} app guide (use only when the user asks about ${APP_NAME}, navigation, spaces, or how to use the app):

Tagline: "${APP_TAGLINE}"

Left sidebar
- Home — New Chat. General assistant conversation, not tied to a space.
- Work — Daily planning (Today: priorities and focus; Space: apps, projects, assets, and connections you've added). Ask opens chat beside the panel.
- Build — Apps, sites, and tools. Projects open with preview/browser on the right. Create via + on the dashboard.
- Explore — Research and browsing. Projects keep browser tabs on the right. Quick Search opens a temporary browser without saving a project.
- Studio — Coming soon.
- Connectors — Browse the connector catalog (Gmail, Slack, calendar, etc.). Installs are coming soon.
- Recents — Recent chats and projects.

General menu (sidebar footer, above Connectors in the flyout)
- Appearance: System / Light / Dark
- Connectors, Recents, Settings shortcuts

Chat and panels
- In Work, Build, or Explore: Ask on the dashboard opens chat next to the space panel.
- Drag the vertical divider to resize chat vs the right panel.
- X on chat closes it and restores the full dashboard.
- Panel toggle (top-right) collapses or opens the right panel.
- Inside a project: right panel is the browser (tabs); chat stays on the left.

Settings
- Organization, Workspaces, Plans, General (profile), Appearance (typography and spacing), Hosting (Cloud / Auto / On-device AI).

Projects
- Build projects — coding, sites, apps with live preview.
- Explore projects — research with persistent browser tabs.
- Tell users "Explore", not "research" (research is the internal id).

Working today
- Assistant chat on Home and in Work / Build / Explore
- Project dashboards with card or list layout (preference is remembered)
- Browser tabs in Build and Explore projects
- Connectors catalog browse, Recents, pins, workspaces
- Appearance and hosting preferences

Coming soon
- Connector installs and OAuth
- Studio space`;

/** True when the user is likely asking how to use the app. */
export function isCanderHelpQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(how (?:do i|to)|where (?:is|are|do)|what (?:is|are)|help me|navigate|navigation)\b/.test(
      t,
    ) &&
    /\b(cander|space|spaces|explore|build|work|connector|panel|sidebar|project|chat|setting)\b/.test(
      t,
    )
  );
}
