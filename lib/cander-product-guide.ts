import { APP_NAME, APP_TAGLINE } from "@/lib/app-brand";

/** Plain-language product reference for help / navigation questions. */
export const CANDER_PRODUCT_GUIDE = `${APP_NAME} app guide (use only when the user asks about ${APP_NAME}, navigation, spaces, or how to use the app):

Tagline: "${APP_TAGLINE}"

Left sidebar
- Explore — Research and browsing (internal id: research). Projects keep browser tabs on the right. Quick Search opens a temporary browser without saving a project.
- Create — Apps, websites, automations, and images (internal id: studio). Build-kind projects still use internal id build. Image projects open the image playground on the right. Create via + on the dashboard.
- Connectors — Browse the connector catalog (Gmail, Slack, calendar, etc.). Installs are coming soon.
- Recents — Recent chats and projects.

General menu (sidebar footer, above Connectors in the flyout)
- Appearance: System / Light / Dark
- Connectors, Recents, Settings shortcuts

Chat and panels
- In Explore or Create: Ask on the dashboard opens chat next to the space panel.
- Drag the vertical divider to resize chat vs the right panel.
- X on chat closes it and restores the full dashboard.
- Panel toggle (top-right) collapses or opens the right panel.
- Inside a project: right panel is the browser (tabs); chat stays on the left.

Settings
- Organization, Workspaces, Plans, General (profile + usage), Appearance (typography and spacing).

Projects
- Create projects — apps, sites, automations (preview) and images (playground).
- Explore projects — research with persistent browser tabs.
- Tell users "Explore" and "Create" (not Home, Build, or Studio). Spoken "Explore" maps to Explore; "Build" / "Studio" open Create.

Working today
- Assistant chat in Explore / Create (shared spaces default)
- Project dashboards with card or list layout (preference is remembered)
- Browser tabs in Create and Explore projects
- Connectors catalog browse, Recents, pins, workspaces
- Appearance preferences

Coming soon
- Connector installs and OAuth
- Deeper Create video and audio tools`;

/** True when the user is likely asking how to use the app. */
export function isCanderHelpQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(how (?:do i|to)|where (?:is|are|do)|what (?:is|are)|help me|navigate|navigation)\b/.test(
      t,
    ) &&
    /\b(cander|space|spaces|home|explore|create|build|work|studio|connector|panel|sidebar|project|chat|setting)\b/.test(
      t,
    )
  );
}
