/**
 * Composio slug maps for Google Workspace connector views (Calendar / Drive / Sheets / Docs).
 * UI shells call these tool ids; live execution lands later via the connector SDK.
 */

export const GCAL_COMPOSIO_SLUGS = {
  "gcal.listCalendars": "GOOGLECALENDAR_LIST_CALENDARS",
  "gcal.listEvents": "GOOGLECALENDAR_EVENTS_LIST",
  "gcal.findEvents": "GOOGLECALENDAR_FIND_EVENT",
  "gcal.createEvent": "GOOGLECALENDAR_CREATE_EVENT",
  "gcal.quickAdd": "GOOGLECALENDAR_QUICK_ADD",
  "gcal.patchEvent": "GOOGLECALENDAR_PATCH_EVENT",
  "gcal.updateEvent": "GOOGLECALENDAR_UPDATE_EVENT",
  "gcal.deleteEvent": "GOOGLECALENDAR_DELETE_EVENT",
} as const;

export const GDRIVE_COMPOSIO_SLUGS = {
  "gdrive.find": "GOOGLEDRIVE_FIND_FILE",
  "gdrive.createFile": "GOOGLEDRIVE_CREATE_FILE",
  "gdrive.createFromText": "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
  "gdrive.createFolder": "GOOGLEDRIVE_CREATE_FOLDER",
  "gdrive.download": "GOOGLEDRIVE_DOWNLOAD_FILE",
  "gdrive.upload": "GOOGLEDRIVE_UPLOAD_FILE",
  "gdrive.edit": "GOOGLEDRIVE_EDIT_FILE",
  "gdrive.share": "GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE",
} as const;

export const GSHEETS_COMPOSIO_SLUGS = {
  "gsheets.search": "GOOGLESHEETS_SEARCH_SPREADSHEETS",
  "gsheets.info": "GOOGLESHEETS_GET_SPREADSHEET_INFO",
  "gsheets.sheetNames": "GOOGLESHEETS_GET_SHEET_NAMES",
  "gsheets.valuesGet": "GOOGLESHEETS_VALUES_GET",
  "gsheets.batchGet": "GOOGLESHEETS_BATCH_GET",
  "gsheets.create": "GOOGLESHEETS_CREATE_GOOGLE_SHEET1",
} as const;

export const GDOCS_COMPOSIO_SLUGS = {
  "gdocs.search": "GOOGLEDOCS_SEARCH_DOCUMENTS",
  "gdocs.get": "GOOGLEDOCS_GET_DOCUMENT_BY_ID",
  "gdocs.create": "GOOGLEDOCS_CREATE_DOCUMENT",
  "gdocs.createMarkdown": "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
  "gdocs.updateMarkdown": "GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN",
  "gdocs.insertText": "GOOGLEDOCS_INSERT_TEXT_ACTION",
} as const;

export type WorkspaceConnectorId = "gcal" | "gdrive" | "gsheets" | "gdocs";

export const WORKSPACE_COMPOSIO_BY_CONNECTOR: Record<
  WorkspaceConnectorId,
  Record<string, string>
> = {
  gcal: GCAL_COMPOSIO_SLUGS,
  gdrive: GDRIVE_COMPOSIO_SLUGS,
  gsheets: GSHEETS_COMPOSIO_SLUGS,
  gdocs: GDOCS_COMPOSIO_SLUGS,
};
