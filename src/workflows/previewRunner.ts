import { SessionStore } from "../core/runLock.js";
import { getAdapter, type DevServer } from "../platform/adapter.js";
import { m } from "../i18n/index.js";

/**
 * `/preview` oturumları. Dev sunucusunu adapter başlatıyor; hangi konuşmada ne
 * çalıştığının defteri burada, böylece her proje tipi aynı defteri paylaşıyor.
 */
interface PreviewSession {
  readonly projectName: string;
  readonly server: DevServer;
  stop(): Promise<void>;
}

const sessions = new SessionStore<PreviewSession>();

export function isRunning(conversationId: number): boolean {
  return sessions.has(conversationId);
}

export interface PreviewStartResult {
  /** Yalnızca deep link'i olan proje tiplerinde dolu (bkz. `DevServer`). */
  connectHint?: string;
  serverUrl: string;
  clientName: string;
}

export async function start(
  conversationId: number,
  projectPath: string,
  projectName: string
): Promise<PreviewStartResult> {
  if (sessions.has(conversationId)) {
    throw new Error(m().runtime.previewAlreadyRunning);
  }

  const adapter = await getAdapter(projectPath);
  const server = await adapter.startDevServer(projectPath);

  const session: PreviewSession = { projectName, server, stop: () => server.stop() };
  sessions.set(conversationId, session);

  // Süreç kendi kendine ölürse (ör. Metro çöktü) kayıt da düşsün, yoksa /preview
  // bir daha "zaten çalışan bir önizleme var" deyip kilitli kalır.
  void server.whenClosed.finally(() => {
    if (sessions.get(conversationId) === session) void sessions.stop(conversationId);
  });

  return { connectHint: server.connectHint, serverUrl: server.serverUrl, clientName: server.clientName };
}

export async function stop(conversationId: number): Promise<boolean> {
  return sessions.stop(conversationId);
}

export function stopAll(): void {
  sessions.stopAll();
}
