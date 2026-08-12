import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import * as registry from "./projectRegistry.js";

const VALID_NAME = /^[a-zA-Z0-9_-]+$/;
const RESERVED_PROJECT_NAMES = new Set(["plans"]);

export class SandboxViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxViolationError";
  }
}

export function isValidProjectName(name: string): boolean {
  return VALID_NAME.test(name) && !RESERVED_PROJECT_NAMES.has(name);
}

export function ensureWorkspaceRoot(): void {
  fs.mkdirSync(config.workspaceRoot, { recursive: true });
}

export function ensureScratchDir(): void {
  fs.mkdirSync(config.scratchDir, { recursive: true });
}

/** Resolves `relativePath` against `baseDir` and throws if it escapes `baseDir`. */
export function resolveInside(baseDir: string, relativePath: string): string {
  const resolved = path.resolve(baseDir, relativePath);
  const normalizedBase = path.resolve(baseDir) + path.sep;
  if (resolved + path.sep !== normalizedBase && !resolved.startsWith(normalizedBase)) {
    throw new SandboxViolationError(`Path "${relativePath}" escapes the allowed directory`);
  }
  return resolved;
}

export function resolveProjectPath(projectName: string): string {
  if (!isValidProjectName(projectName)) {
    throw new SandboxViolationError(`Invalid project name "${projectName}"`);
  }
  // Bağlı proje workspace dışında yaşıyor; sandbox kontrolü onun için kasıtlı
  // olarak atlanıyor. Kullanıcının açıkça seçtiği klasör zaten sınırın kendisi.
  const external = registry.pathOf(projectName);
  if (external) return external;

  return resolveInside(config.workspaceRoot, projectName);
}

export function projectExists(projectName: string): boolean {
  if (!isValidProjectName(projectName)) return false;
  const projectPath = registry.pathOf(projectName) ?? path.join(config.workspaceRoot, projectName);
  return fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory();
}

/** Workspace kökündeki klasörler — bağlı projeler hariç. */
function listWorkspaceProjects(): string[] {
  ensureWorkspaceRoot();
  return fs
    .readdirSync(config.workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !RESERVED_PROJECT_NAMES.has(entry.name))
    .map((entry) => entry.name);
}

export function listProjects(): string[] {
  return [...new Set([...listWorkspaceProjects(), ...registry.names()])].sort();
}

export interface ProjectInfo {
  name: string;
  path: string;
  /** Workspace dışından bağlanmış mı (yeniden başlatmada kaybolur). */
  linked: boolean;
}

export function listProjectsDetailed(): ProjectInfo[] {
  return listProjects().map((name) => ({
    name,
    path: resolveProjectPath(name),
    linked: registry.isLinked(name),
  }));
}

/**
 * Klasör adından geçerli bir proje ismi türetir: izin verilen karakter kümesi
 * `[a-zA-Z0-9_-]` olduğu için boşluk ve nokta gibi karakterler tireye dönüyor.
 */
function toProjectName(absolutePath: string): string {
  const base = path.basename(absolutePath).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "proje";
}

/** İsim workspace'te ya da başka bir bağlı projede kullanılıyorsa sonuna sayı ekler. */
function uniqueProjectName(preferred: string): string {
  const taken = new Set(listProjects());
  if (!taken.has(preferred)) return preferred;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${preferred}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Workspace dışındaki bir klasörü projeymiş gibi kullanılabilir hale getirir.
 *
 * Kayıt `resolveProjectPath`/`projectExists`/`listProjects` üzerinden okunduğu
 * için bağlanan klasör bütün komutlarda (Telegram dahil) workspace projesiyle
 * aynı şekilde davranır.
 */
export function linkProject(absolutePath: string): ProjectInfo {
  const resolved = path.resolve(absolutePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Klasör bulunamadı: ${resolved}`);
  }

  const already = registry.entries().find((entry) => entry.path === resolved);
  if (already) return { ...already, linked: true };

  const name = uniqueProjectName(toProjectName(resolved));
  registry.register(name, resolved);
  return { name, path: resolved, linked: true };
}

export function unlinkProject(name: string): boolean {
  return registry.unregister(name);
}
