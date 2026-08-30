export type ComputerScopeType = "chat" | "project" | "task" | "workspace";

export type ControlMode = "agent" | "user" | "paused";

export type ComputerSessionStatus = "starting" | "active" | "idle" | "stopped" | "error";

export type BrowserObservation = {
  url: string;
  title: string;
  snapshot: string;
  sessionId?: string;
};

export type ComputerSessionRecord = {
  id: string;
  userId: string;
  scopeType: ComputerScopeType;
  scopeId: string;
  chatId: string | null;
  projectId: string | null;
  workspaceId: string | null;
  taskId: string | null;
  provider: string;
  providerSessionId: string | null;
  status: ComputerSessionStatus;
  controlMode: ControlMode;
  currentUrl: string | null;
  streamUrl: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string | null;
};

export type CreateComputerSessionParams = {
  userId: string;
  scopeType: ComputerScopeType;
  scopeId: string;
  chatId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  taskId?: string | null;
  url?: string;
};

export type ComputerProvider = {
  readonly id: string;
  createOrReuseSession(params: CreateComputerSessionParams): Promise<ComputerSessionRecord>;
  getSession(sessionId: string, userId: string): Promise<ComputerSessionRecord | null>;
  stopSession(sessionId: string, userId: string): Promise<void>;
  browserOpen(sessionId: string, userId: string, url: string): Promise<BrowserObservation>;
  browserObserve(sessionId: string, userId: string): Promise<BrowserObservation>;
  browserClick(sessionId: string, userId: string, ref: string): Promise<BrowserObservation>;
  browserFill(
    sessionId: string,
    userId: string,
    ref: string,
    value: string,
  ): Promise<BrowserObservation>;
  browserNavigate(sessionId: string, userId: string, url: string): Promise<BrowserObservation>;
  setControlMode(
    sessionId: string,
    userId: string,
    mode: ControlMode,
  ): Promise<ControlMode>;
  getStreamUrl(sessionId: string, userId: string): Promise<string | null>;
  exec(
    sessionId: string,
    userId: string,
    command: string,
    args?: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  writeFile(
    sessionId: string,
    userId: string,
    path: string,
    content: string,
  ): Promise<void>;
  readFile(sessionId: string, userId: string, path: string): Promise<string>;
  restoreProject(
    sessionId: string,
    userId: string,
    projectId: string,
  ): Promise<{ fileCount: number }>;
};
