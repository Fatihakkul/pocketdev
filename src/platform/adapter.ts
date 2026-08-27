import fs from "node:fs";
import path from "node:path";
import type { ProgressFn } from "../core/processRunner.js";
import { EXPO_SPECIFIC_CONFIG_FILES } from "./expo/config.js";

/**
 * Proje tipinden bağımsız yürütme arayüzü.
 *
 * `platform/ios/` (xcodebuild, imzalama, .ipa export, OTA sunucu, tünel) ve
 * `workflows/` bu arayüzü çağırır; hangi araç zincirinin kullanıldığını yalnızca
 * adapter bilir. Yeni bir proje tipi eklemek `platform/<tip>/adapter.ts` yazıp
 * aşağıdaki `ADAPTERS` listesine eklemek demek.
 */

export type ProjectKind = "expo" | "react-native-cli";

export interface AppInfo {
  bundleId: string;
  appName: string;
  version: string;
  /** Kurulum sayfasının ikonu; bilinmiyorsa boş dizge. */
  iconPath: string;
}

export interface DevServer {
  /**
   * İstemciyi doğrudan açan deep link. Yalnızca Expo dev client'ta var; RN CLI'da
   * böyle bir şema yok, orada tek yol `serverUrl`'ü dev menüsüne elle girmek —
   * bu yüzden `undefined` olabiliyor ve mesajı kuran taraf ona göre dallanıyor.
   */
  connectHint?: string;
  /** Dev menüsüne elle girilecek sunucu adresi. */
  serverUrl: string;
  /** Kullanıcının açacağı istemcinin adı — mesaj metni bunu kullanıyor. */
  clientName: string;
  /** Sunucu kendi kendine ölürse çözülür; çağıran oturum kaydını düşürebilsin diye. */
  whenClosed: Promise<void>;
  stop(): Promise<void>;
}

export interface SimulatorRun {
  /** Uygulama simülatörde açılana kadar bekler. */
  waitUntilLaunched(timeoutMs: number): Promise<void>;
  stop(): Promise<void>;
}

export interface ProjectAdapter {
  readonly kind: ProjectKind;

  /** Uygulama kimliği ve sürümü — imzalama profili bununla seçiliyor. */
  readAppInfo(projectPath: string): Promise<AppInfo>;

  /** Native projeyi JS bağımlılıklarıyla eşitler; gerekmiyorsa false döner. */
  syncNative(projectPath: string, onProgress?: (lastLine?: string) => void): Promise<boolean>;

  /** Metro'yu başlatır. Oturum yönetimi çağırana ait. */
  startDevServer(projectPath: string): Promise<DevServer>;

  /** Bağlı cihaza Debug build kurar (/localbuild). */
  runOnDevice(projectPath: string, udid: string, onProgress?: ProgressFn): Promise<void>;

  /** Uygulamayı açık simülatörde başlatır (/record). */
  runOnSimulator(projectPath: string): Promise<SimulatorRun>;

  /** Bu adapter'da desteklenmeyen komutlar (ör. RN CLI'da /qabuild). */
  supports(command: string): boolean;
}

interface AdapterRegistration {
  kind: ProjectKind;
  /** Proje bu tipe uyuyor mu? Sıra önemli — ilk eşleşen kazanır. */
  detect(projectPath: string): boolean;
  load(): Promise<ProjectAdapter>;
}

function readJson(filePath: string): Record<string, any> | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function hasDependency(projectPath: string, name: string): boolean {
  const pkg = readJson(path.join(projectPath, "package.json"));
  return Boolean(pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]);
}

const ADAPTERS: AdapterRegistration[] = [
  {
    kind: "expo",
    detect: (projectPath) =>
      hasDependency(projectPath, "expo") ||
      readJson(path.join(projectPath, "app.json"))?.expo !== undefined ||
      // `app.json` tek olasılık değil: proje `app.config.ts` ya da
      // `app.config.json` kullanıyor olabilir. Bu dosyalar RN CLI'da bulunmaz,
      // varlıkları tek başına yeterli sinyal (bkz. expo/config.ts).
      EXPO_SPECIFIC_CONFIG_FILES.some((name) => fs.existsSync(path.join(projectPath, name))),
    load: async () => (await import("./expo/adapter.js")).expoAdapter,
  },
  {
    kind: "react-native-cli",
    detect: (projectPath) =>
      fs.existsSync(path.join(projectPath, "ios", "Podfile")) &&
      hasDependency(projectPath, "react-native"),
    load: async () => (await import("./react-native-cli/adapter.js")).reactNativeCliAdapter,
  },
];

/**
 * Projenin tipini döner; hiçbiri tutmuyorsa `undefined`.
 *
 * Sonuç bilerek önbelleğe alınmıyor — kullanıcı proje içinde bağımlılık ekleyip
 * çıkarabiliyor ve tespit her çağrıda güncel dosyalara bakmalı.
 */
export function detectProjectKind(projectPath: string): ProjectKind | undefined {
  return ADAPTERS.find((entry) => entry.detect(projectPath))?.kind;
}

/** Projeye uygun adapter'ı yükler; tip anlaşılamazsa hata atar. */
export async function getAdapter(projectPath: string): Promise<ProjectAdapter> {
  const entry = ADAPTERS.find((candidate) => candidate.detect(projectPath));
  if (!entry) {
    throw new Error(
      "Bu klasör tanınan bir mobil proje değil (Expo ya da React Native CLI bekleniyor).\n" +
        "Claude'u sürme komutları çalışmaya devam eder; iOS build/önizleme komutları bu projede kullanılamaz."
    );
  }
  return entry.load();
}

/** Komut bu projede destekleniyor mu — desteklenmiyorsa sebebiyle birlikte döner. */
export async function ensureSupported(projectPath: string, command: string): Promise<ProjectAdapter> {
  const adapter = await getAdapter(projectPath);
  if (!adapter.supports(command)) {
    throw new Error(`/${command} bu proje tipinde (${adapter.kind}) desteklenmiyor.`);
  }
  return adapter;
}
