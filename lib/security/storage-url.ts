const WORKSPACE_ICON_PATH = /^\/storage\/v1\/object\/public\/workspace-icons\/([^/]+)\/icon\.(png|jpe?g|webp|gif)$/i;
const CONNECTOR_ACCOUNT_ICON_PATH =
  /^\/storage\/v1\/object\/public\/connector-account-icons\/([^/]+)\/([^/]+)\/icon\.(png|jpe?g|webp|gif)$/i;

/** Only allow icon URLs produced by this workspace's Supabase Storage bucket. */
export function isManagedWorkspaceIconUrl(input: {
  iconUrl: string;
  workspaceId: string;
  storageOrigin: string;
}): boolean {
  try {
    const iconUrl = new URL(input.iconUrl);
    const storageOrigin = new URL(input.storageOrigin);
    if (iconUrl.origin !== storageOrigin.origin) return false;

    const match = iconUrl.pathname.match(WORKSPACE_ICON_PATH);
    return Boolean(match && decodeURIComponent(match[1] ?? "") === input.workspaceId);
  } catch {
    return false;
  }
}

/** Account icons: `{ownerId}/{connectionId}/icon.{ext}` in connector-account-icons. */
export function isManagedConnectorAccountIconUrl(input: {
  iconUrl: string;
  ownerId: string;
  connectionId: string;
  storageOrigin: string;
}): boolean {
  try {
    const iconUrl = new URL(input.iconUrl);
    const storageOrigin = new URL(input.storageOrigin);
    if (iconUrl.origin !== storageOrigin.origin) return false;

    const match = iconUrl.pathname.match(CONNECTOR_ACCOUNT_ICON_PATH);
    if (!match) return false;
    return (
      decodeURIComponent(match[1] ?? "") === input.ownerId &&
      decodeURIComponent(match[2] ?? "") === input.connectionId
    );
  } catch {
    return false;
  }
}
