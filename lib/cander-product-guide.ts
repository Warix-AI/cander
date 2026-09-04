import { APP_NAME, APP_TAGLINE } from "@/lib/app-brand";

/** Plain-language product reference for help / navigation questions. */
export const CANDER_PRODUCT_GUIDE = `${APP_NAME} app guide (use only when the user asks about ${APP_NAME}, navigation, spaces, or how to use the app):

Tagline: "${APP_TAGLINE}"

Left sidebar
- Home — Research and browsing (internal id: research). Projects keep browser tabs on the right. Quick Search opens a temporary browser without saving a project. Shared default chat with Build.
- Build — Apps, sites, and tools. Projects open with preview/browser on the right. Create via + on the dashboard.
- Studio — Creative projects with browser tabs beside chat (images, video, audio, presentations).
- Connectors — Browse the connector catalog (Gmail, Slack, calendar, etc.). Installs are coming soon.
- Recents — Recent chats and projects.

General menu (sidebar footer, above Connectors in the flyout)
- Appearance: System / Light / Dark
- Connectors, Recents, Settings shortcuts

Chat and panels
- In Home or Build: Ask on the dashboard opens chat next to the space panel.
- Drag the vertical divider to resize chat vs the right panel.
- X on chat closes it and restores the full dashboard.
- Panel toggle (top-right) collapses or opens the right panel.
- Inside a project: right panel is the browser (tabs); chat stays on the left.

Settings
- Organization, Workspaces, Plans, General (profile + usage), Appearance (typography and spacing).

Projects
- Build projects — coding, sites, apps with live preview.
- Home projects — research with persistent browser tabs.
- Tell users "Home", not "research" or "Explore" (research is the internal id). Spoken "Explore" still maps to Home.

Working today
- Assistant chat in Home / Build / Studio (shared spaces default)
- Project dashboards with card or list layout (preference is remembered)
- Browser tabs in Build and Home projects
- Connectors catalog browse, Recents, pins, workspaces
- Appearance preferences

Coming soon
- Connector installs and OAuth
- Deeper Studio creative tools`;

/** True when the user is likely asking how to use the app. */
export function isCanderHelpQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(how (?:do i|to)|where (?:is|are|do)|what (?:is|are)|help me|navigate|navigation)\b/.test(
      t,
    ) &&
    /\b(cander|space|spaces|home|explore|build|work|studio|connector|panel|sidebar|project|chat|setting)\b/.test(
      t,
    )
  );
}
