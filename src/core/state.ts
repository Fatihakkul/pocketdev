import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
}

interface ProjectState {
  sessionId?: string;
  usage: UsageStats;
}

interface ConversationState {
  activeProject?: string;
  model?: string;
  lastModel?: string;
  sessionUnlocked?: boolean;
  projects: Record<string, ProjectState>;
  totalUsage: UsageStats;
}

interface StateFile {
  /**
   * Diskteki anahtar bilerek `chats` kaldı: kod içinde "konuşma" desek de bu
   * dosya zaten yazılmış durumda ve adı değiştirmek mevcut kurulumlarda aktif
   * proje, model ve kullanım geçmişini sıfırlardı.
   */
  chats: Record<string, ConversationState>;
  /** Botu `/claim` ile sahiplenmiş Telegram kullanıcısı. */
  ownerId?: number;
}

function emptyUsage(): UsageStats {
  return { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0 };
}

function emptyConversationState(): ConversationState {
  return { projects: {}, totalUsage: emptyUsage() };
}

function load(): StateFile {
  try {
    const raw = fs.readFileSync(config.stateFile, "utf-8");
    return JSON.parse(raw) as StateFile;
  } catch {
    return { chats: {} };
  }
}

function save(state: StateFile): void {
  fs.mkdirSync(path.dirname(config.stateFile), { recursive: true });
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}

function getOrCreateConversation(state: StateFile, conversationId: number): ConversationState {
  const key = String(conversationId);
  const existing = state.chats[key];
  if (existing) return existing;
  const created = emptyConversationState();
  state.chats[key] = created;
  return created;
}

function getOrCreateProject(conversation: ConversationState, projectName: string): ProjectState {
  const existing = conversation.projects[projectName];
  if (existing) return existing;
  const created: ProjectState = { usage: emptyUsage() };
  conversation.projects[projectName] = created;
  return created;
}

export function getOwnerId(): number | undefined {
  return load().ownerId;
}

export function setOwnerId(userId: number): void {
  const state = load();
  state.ownerId = userId;
  save(state);
}

export function getActiveProject(conversationId: number): string | undefined {
  return load().chats[String(conversationId)]?.activeProject;
}

export function setActiveProject(conversationId: number, projectName: string): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  conversation.activeProject = projectName;
  save(state);
}

export function clearActiveProject(conversationId: number): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  conversation.activeProject = undefined;
  save(state);
}

export function isSessionUnlocked(conversationId: number): boolean {
  return load().chats[String(conversationId)]?.sessionUnlocked === true;
}

export function setSessionUnlocked(conversationId: number, unlocked: boolean): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  conversation.sessionUnlocked = unlocked;
  save(state);
}

export function getModel(conversationId: number): string | undefined {
  return load().chats[String(conversationId)]?.model;
}

export function setModel(conversationId: number, model: string): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  conversation.model = model;
  save(state);
}

export function getLastModel(conversationId: number): string | undefined {
  return load().chats[String(conversationId)]?.lastModel;
}

export function setLastModel(conversationId: number, model: string): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  conversation.lastModel = model;
  save(state);
}

export function getSessionId(conversationId: number, projectName: string): string | undefined {
  return load().chats[String(conversationId)]?.projects[projectName]?.sessionId;
}

export function setSessionId(conversationId: number, projectName: string, sessionId: string): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  const project = getOrCreateProject(conversation, projectName);
  project.sessionId = sessionId;
  save(state);
}

export function clearSessionId(conversationId: number, projectName: string): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  const project = getOrCreateProject(conversation, projectName);
  project.sessionId = undefined;
  save(state);
}

function addUsage(target: UsageStats, delta: Partial<UsageStats>): void {
  target.inputTokens += delta.inputTokens ?? 0;
  target.outputTokens += delta.outputTokens ?? 0;
  target.cacheCreationTokens += delta.cacheCreationTokens ?? 0;
  target.cacheReadTokens += delta.cacheReadTokens ?? 0;
  target.costUsd += delta.costUsd ?? 0;
}

export function recordUsage(conversationId: number, projectName: string, delta: Partial<UsageStats>): void {
  const state = load();
  const conversation = getOrCreateConversation(state, conversationId);
  const project = getOrCreateProject(conversation, projectName);
  addUsage(project.usage, delta);
  addUsage(conversation.totalUsage, delta);
  save(state);
}

export function getUsage(conversationId: number, projectName?: string): UsageStats {
  const conversation = load().chats[String(conversationId)];
  if (!conversation) return emptyUsage();
  if (!projectName) return conversation.totalUsage;
  return conversation.projects[projectName]?.usage ?? emptyUsage();
}
