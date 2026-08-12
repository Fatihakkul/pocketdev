import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import { runProcess, type ProgressFn } from "../../core/processRunner.js";
import type { AppInfo, ProjectAdapter, SimulatorRun } from "../adapter.js";
import { needsSync, RN_CLI_INPUTS, writeStamp } from "../nativeSync.js";
import { buildModeFlag, reactNativeBin, readReactNativeVersion } from "./cli.js";
import * as devServer from "./devServer.js";
import { startMetro } from "./metro.js";
import { m } from "../../i18n/index.js";

// `pod install` ilk kurulumda spec repo'yu güncellemek zorunda kalabiliyor ve o
// zaman dakikalarca sürüyor — Expo'daki prebuild ile aynı bütçe.
const POD_INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000;
const SHOW_SETTINGS_TIMEOUT_MS = 3 * 60 * 1000;

/** `/qabuild` EAS'e ve `app.json`'daki Expo alanlarına bağlı, RN CLI'da karşılığı yok. */
const UNSUPPORTED_COMMANDS = new Set(["qabuild"]);

// ---------------------------------------------------------------------------
// readAppInfo — Expo'da app.json neyse, burada xcodebuild ayarları o
// ---------------------------------------------------------------------------

interface BuildSettingsEntry {
  buildSettings?: Record<string, string>;
}

/**
 * `xcodebuild -showBuildSettings -json` çıktısından uygulama kimliğini çıkarır.
 *
 * Süreçten ayrı tutuluyor ki test edilebilsin. Çıktı bir dizi (hedef başına bir
 * girdi); ilk girdi ana uygulama hedefi oluyor, ama `PRODUCT_BUNDLE_IDENTIFIER`
 * taşıyan ilk girdiyi aramak daha dayanıklı: bazı kurulumlarda başa test hedefi
 * ya da ayarsız bir toplayıcı hedef düşebiliyor.
 */
export function parseBuildSettings(stdout: string, fallbackName: string): Omit<AppInfo, "iconPath"> & {
  appIconName: string;
} {
  let entries: BuildSettingsEntry[];
  try {
    entries = JSON.parse(stdout);
  } catch {
    throw new Error(m().runtime.buildSettingsUnreadable);
  }

  const settings = entries.find((entry) => entry.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER)?.buildSettings;
  const bundleId = settings?.PRODUCT_BUNDLE_IDENTIFIER;
  if (!bundleId) {
    throw new Error(
      "Xcode projesinde PRODUCT_BUNDLE_IDENTIFIER ayarlı değil, imzalama profili seçilemez."
    );
  }

  return {
    bundleId,
    appName: settings?.PRODUCT_NAME || fallbackName,
    // MARKETING_VERSION Xcode 11 öncesi projelerde boş olabiliyor; Info.plist'e
    // düşmek yerine Expo adapter'ıyla aynı "?" gösterimini kullanıyoruz.
    version: settings?.MARKETING_VERSION || "?",
    appIconName: settings?.ASSETCATALOG_COMPILER_APPICON_NAME || "AppIcon",
  };
}

/**
 * Asset katalogundaki uygulama ikonunu bulur; yoksa boş dizge (kurulum sayfası
 * ikonsuz çalışmaya devam eder).
 *
 * En BÜYÜK png seçiliyor: `.appiconset` içinde 20pt'den 1024pt'ye kadar onlarca
 * boyut var ve kurulum sayfasının istediği büyük olanı.
 */
export function findAppIcon(iosDir: string, appIconName: string): string {
  const setName = `${appIconName}.appiconset`;

  const search = (dir: string, depth: number): string | undefined => {
    if (depth < 0) return undefined;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return undefined;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === setName) return full;
      // Pods/ ve build çıktıları binlerce dizin içeriyor; taramaya değmez.
      if (entry.name === "Pods" || entry.name === "build") continue;
      const found = search(full, depth - 1);
      if (found) return found;
    }
    return undefined;
  };

  const iconSet = search(iosDir, 3);
  if (!iconSet) return "";

  const pngs = fs
    .readdirSync(iconSet)
    .filter((name) => name.endsWith(".png"))
    .map((name) => path.join(iconSet, name));
  if (pngs.length === 0) return "";

  return pngs.reduce((largest, candidate) =>
    fs.statSync(candidate).size > fs.statSync(largest).size ? candidate : largest
  );
}

/**
 * Xcode'a hangi hedefi soracağımız. `.xcworkspace` tercih ediliyor ama
 * `.xcodeproj`'e düşmek şart: `readAppInfo` ilk `/otabuild`'de `pod install`'dan
 * ÖNCE çağrılıyor (bkz. otaRunner) ve workspace henüz üretilmemiş olabilir.
 */
function settingsArgs(projectPath: string): string[] {
  const iosDir = path.join(projectPath, "ios");
  const entries = fs.existsSync(iosDir) ? fs.readdirSync(iosDir) : [];

  const workspace = entries.find((entry) => entry.endsWith(".xcworkspace"));
  if (workspace) {
    return [
      "-workspace",
      path.join(iosDir, workspace),
      "-scheme",
      path.basename(workspace, ".xcworkspace"),
    ];
  }

  const project = entries.find((entry) => entry.endsWith(".xcodeproj"));
  if (project) {
    return ["-project", path.join(iosDir, project)];
  }

  throw new Error(m().runtime.noXcodeProject);
}

async function readAppInfo(projectPath: string): Promise<AppInfo> {
  const { stdout, exitCode } = await execa(
    "xcodebuild",
    ["-showBuildSettings", "-json", ...settingsArgs(projectPath)],
    { cwd: projectPath, timeout: SHOW_SETTINGS_TIMEOUT_MS, reject: false }
  );
  if (exitCode !== 0) {
    throw new Error(`xcodebuild proje ayarlarını okuyamadı (exit ${exitCode ?? "?"}).`);
  }

  const parsed = parseBuildSettings(stdout, path.basename(projectPath));
  return {
    bundleId: parsed.bundleId,
    appName: parsed.appName,
    version: parsed.version,
    iconPath: findAppIcon(path.join(projectPath, "ios"), parsed.appIconName),
  };
}

// ---------------------------------------------------------------------------
// syncNative — Expo'da `expo prebuild`, burada `pod install`
// ---------------------------------------------------------------------------

/**
 * `pod install` çağrısı. RN şablonu bir `Gemfile` ile geliyor ve o zaman doğrusu
 * `bundle exec pod install`: CocoaPods sürümü orada sabitlenmiş oluyor, sistem
 * geneline kurulu farklı bir sürüm `Podfile.lock`'u sessizce değiştirebiliyor.
 * Gemfile yoksa düz `pod` kullanılıyor.
 */
export function podInstallCommand(projectPath: string): { file: string; args: string[] } {
  return fs.existsSync(path.join(projectPath, "Gemfile"))
    ? { file: "bundle", args: ["exec", "pod", "install"] }
    : { file: "pod", args: ["install"] };
}

/**
 * Podfile ya da bağımlılıklar değiştiyse Pods'u yeniden kurar.
 *
 * Expo'daki gerekçenin aynısı: `xcodebuild archive` yalnızca var olan Pod'ları
 * derliyor, yeni eklenmiş bir native modül `Podfile.lock`'a girmediyse build
 * yeşil geçip cihazda patlıyor. Karar mantığı (`needsSync`/`writeStamp`) iki
 * adapter'da ortak; değişen yalnızca girdi listesi ve komut.
 */
async function syncNative(
  projectPath: string,
  onProgress?: (lastLine?: string) => void
): Promise<boolean> {
  if (!needsSync(projectPath, RN_CLI_INPUTS)) return false;

  const { file, args } = podInstallCommand(projectPath);
  const install = runProcess(file, args, {
    cwd: path.join(projectPath, "ios"),
    timeoutMs: POD_INSTALL_TIMEOUT_MS,
    logFilePath: path.join(projectPath, "build", "pod-install.log"),
    onProgress: (_elapsedMs, lastLine) => onProgress?.(lastLine),
  });

  await install.finished("pod install");
  writeStamp(projectPath, RN_CLI_INPUTS);
  return true;
}

// ---------------------------------------------------------------------------
// Cihaz / simülatör
// ---------------------------------------------------------------------------

/**
 * Bağlı cihaza Debug build kurar.
 *
 * `--no-packager`, Expo'daki `--no-bundler` ile aynı sebeple veriliyor: bayrak
 * olmadan RN CLI Metro'yu ayrı bir Terminal penceresinde açıyor ve build
 * "bitmemiş" görünüyor. Dev sunucusunu zaten /preview kendi tüneliyle başlatıyor.
 *
 * `--udid` bilerek seçildi: RN CLI'ın `--device` bayrağı isimle eşleştiriyor ve
 * değersiz verilirse interaktif seçici açıyor — TTY'siz botta orada asılı kalır
 * (Expo tarafında birebir aynı tuzağa düşülmüştü, bkz. docs/LOCAL_BUILD.md).
 */
async function runOnDevice(projectPath: string, udid: string, onProgress?: ProgressFn): Promise<void> {
  const modeFlag = buildModeFlag(readReactNativeVersion(projectPath));
  const build = runProcess(
    reactNativeBin(projectPath),
    ["run-ios", "--udid", udid, modeFlag, "Debug", "--no-packager"],
    {
      cwd: projectPath,
      timeoutMs: BUILD_TIMEOUT_MS,
      // Tam log şart: `run-ios` xcodebuild'i sarmalıyor ve asıl hata satırı
      // çıktının ortasında kalıyor — kuyrukta yalnızca özet görünüyor
      // (aynı ders `/otabuild` için docs/LOCAL_BUILD.md'de kayıtlı).
      logFilePath: path.join(projectPath, "build", "run-ios.log"),
      onProgress,
    }
  );
  await build.finished("Build");
}

/**
 * Uygulamayı açık simülatörde başlatır (/record).
 *
 * Metro'yu ayrıca başlatıp `--no-packager` vermek zorundayız: RN CLI'ın kendi
 * packager'ı ayrı bir Terminal penceresinde açılıyor ve bot onu ne izleyebiliyor
 * ne de kapatabiliyor — kayıttan sonra arkada Metro kalırdı. Bundle olmadan da
 * kayıt anlamsız olurdu (kırmızı ekran).
 */
async function runOnSimulator(projectPath: string): Promise<SimulatorRun> {
  const metro = await startMetro(projectPath);

  const app = runProcess(reactNativeBin(projectPath), ["run-ios", "--no-packager"], {
    cwd: projectPath,
    detached: true,
  });

  return {
    waitUntilLaunched: async (timeoutMs) => {
      try {
        await app.waitForOutput(/Successfully launched the app/, timeoutMs, "Build/kurulum");
      } catch (error) {
        await metro.stop();
        throw error;
      }
    },
    stop: async () => {
      await app.stop();
      await metro.stop();
    },
  };
}

export const reactNativeCliAdapter: ProjectAdapter = {
  kind: "react-native-cli",
  readAppInfo,
  syncNative,
  startDevServer: devServer.start,
  runOnDevice,
  runOnSimulator,
  supports: (command: string) => !UNSUPPORTED_COMMANDS.has(command),
};
