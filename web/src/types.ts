export interface JobRecord {
  id: string;
  kind: string;
  label?: string;
  project: string;
  channel: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "success" | "error";
  detail?: string;
  error?: string;
  lastLine?: string;
  logPath?: string;
}

export interface CommandInfo {
  name: string;
  description: string;
  usage?: string;
}

export interface EnvEntry {
  key: string;
  value?: string;
  secret: boolean;
  hasValue: boolean;
}

export interface ProjectInfo {
  name: string;
  path: string;
  /** Workspace dışından bağlanmış mı (bot yeniden başlayınca kaybolur). */
  linked: boolean;
}

export interface PanelState {
  activeJobs: JobRecord[];
  history: JobRecord[];
  commands: CommandInfo[];
  projects: ProjectInfo[];
  activeProject?: string;
  env: EnvEntry[];
  running: string[];
}

export interface CommandResult {
  messages?: string[];
  attachments?: string[];
  progress?: string;
  error?: string;
}
