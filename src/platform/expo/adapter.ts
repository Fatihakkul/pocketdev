import fs from "node:fs";
import path from "node:path";
import { runProcess, type ProgressFn } from "../../core/processRunner.js";
import type { AppInfo, DevServer, ProjectAdapter, SimulatorRun } from "../adapter.js";
import { EXPO_INPUTS, needsSync, writeStamp } from "../nativeSync.js";
import { expoNativeInputsHash, readExpoConfig, type ExpoConfig } from "./config.js";
import * as devServer from "./devServer.js";
import { m } from "../../i18n/index.js";

// Prebuild'in uzun süren kısmı `pod install`; ilk kurulumda spec repo'yu
// güncellemesi gerekirse dakikalarca sürebiliyor.
const PREBUILD_TIMEOUT_MS = 15 * 60 * 1000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000; // ilk build 10-20dk, artımlı build'ler çok daha hızlı

/** Hata metinleri çağrı yerine göre farklı; refactor öncesi haliyle korunuyor. */
function expoBinPath(projectPath: string, missingMessage: string): string {
  const expoBin = path.join(projectPath, "node_modules", ".bin", "expo");
  if (!fs.existsSync(expoBin)) {
    throw new Error(missingMessage);
  }
  return expoBin;
}

const EXPO_MISSING_BUILD = "expo CLI bulunamadı. Bağımlılıkların kurulu olduğundan emin ol (npm install).";
const EXPO_MISSING_PREBUILD = "expo CLI bulunamadı, prebuild çalıştırılamıyor. Önce `npm install`.";

async function readAppInfo(projectPath: string): Promise<AppInfo> {
  let expo: ExpoConfig = {};
  let configError: Error | undefined;
  try {
    expo = await readExpoConfig(projectPath);
  } catch (error) {
    // Config okunamazsa kurulum sayfası jenerik başlıkla çalışmaya devam eder.
    configError = error as Error;
  }
  const icon = typeof expo.icon === "string" ? expo.icon : "";
  const bundleId = expo.ios?.bundleIdentifier;
  if (typeof bundleId !== "string" || bundleId.length === 0) {
    // Config hiç okunamadıysa asıl sebep o; "bundleIdentifier ayarlı değil"
    // demek kullanıcıyı var olmayan bir alanı aramaya gönderir.
    throw configError ?? new Error(m().runtime.noBundleIdentifier);
  }
  return {
    appName: typeof expo.name === "string" ? expo.name : path.basename(projectPath),
    version: typeof expo.version === "string" ? expo.version : "?",
    iconPath: icon ? path.resolve(projectPath, icon) : "",
    bundleId,
  };
}

/**
 * Bağımlılık ya da config plugin değiştiyse native projeyi yeniden üretir.
 *
 * Atlanırsa build yeşil geçer ama cihazda eksik native modül patlar:
 * `xcodebuild archive` yalnızca var olan Pod'ları derler ve config plugin'leri
 * hiç çalıştırmaz.
 */
async function syncNative(
  projectPath: string,
  onProgress?: (lastLine?: string) => void
): Promise<boolean> {
  // Özet ham dosyalardan değil çözümlenmiş config'ten alınıyor: plugin listesi
  // `app.config.ts` içinde hesaplanıyor olabilir, o zaman dosyanın kendisi hiç
  // değişmeden native taraf değişir. Config okunamıyorsa (bağımlılıklar kurulu
  // değil) dosya tabanlı özete düşüyoruz.
  let currentHash: string | undefined;
  try {
    currentHash = await expoNativeInputsHash(projectPath);
  } catch {
    currentHash = undefined;
  }

  if (!needsSync(projectPath, EXPO_INPUTS, currentHash)) return false;

  // `--clean` KULLANMIYORUZ: o, ios/ klasörünü silip sıfırdan üretiyor ve
  // projede elle yapılmış native düzenleme varsa onu da götürüyor. Üzerine
  // yazan varsayılan mod bağımlılık/plugin değişikliklerini almaya yetiyor.
  //
  // İmzalama ayarlarının prebuild tarafından ezilmesi sorun değil: archive
  // zaten takımı, profili ve kimliği komut satırından veriyor (bkz. archive()).
  //
  // CI=1 vermiyoruz. Expo, stdout pipe'lı olduğu için zaten non-interactive
  // çalışıyor; CI bayrağının başka yan etkileri var (bkz. devServer.ts).
  const prebuild = runProcess(expoBinPath(projectPath, EXPO_MISSING_PREBUILD), ["prebuild", "--platform", "ios"], {
    cwd: projectPath,
    timeoutMs: PREBUILD_TIMEOUT_MS,
    logFilePath: path.join(projectPath, "build", "prebuild.log"),
    onProgress: (_elapsedMs, lastLine) => onProgress?.(lastLine),
  });

  await prebuild.finished("Prebuild");
  // Özet prebuild'den SONRA yeniden hesaplanıyor (bkz. writeStamp yorumu):
  // prebuild kendi girdilerini değiştirebiliyor.
  let stampHash: string | undefined;
  try {
    stampHash = await expoNativeInputsHash(projectPath);
  } catch {
    stampHash = undefined;
  }
  writeStamp(projectPath, EXPO_INPUTS, stampHash);
  return true;
}

/**
 * Yerel Debug build alır ve cihaza kurar — `/devbuild`'in EAS kredisi harcamayan
 * karşılığı (bkz. docs/LOCAL_BUILD.md).
 *
 * `--no-bundler` şart: bayrak olmadan `expo run:ios` kurulumdan sonra Metro'yu
 * açık tutuyor (runIosAsync.js → shouldStartBundler) ve süreç hiç bitmiyor, yani
 * build "asılı" görünürdü. Fast refresh için dev sunucusunu zaten /preview
 * ayrı bir tunnel ile başlatıyor.
 *
 * `--device` değerini AÇIKÇA veriyoruz: çıplak `--device` interaktif seçici
 * açıyor ve TTY'siz botta süreç orada asılı kalıyor.
 */
async function runOnDevice(projectPath: string, udid: string, onProgress?: ProgressFn): Promise<void> {
  const build = runProcess(
    expoBinPath(projectPath, EXPO_MISSING_BUILD),
    ["run:ios", "--device", udid, "--configuration", "Debug", "--no-bundler"],
    {
      cwd: projectPath,
      timeoutMs: BUILD_TIMEOUT_MS,
      // Tam log şart: asıl xcodebuild hatası çıktının ortasında kalıyor.
      logFilePath: path.join(projectPath, "build", "run-ios.log"),
      onProgress,
    }
  );
  await build.finished("Build");
}

/**
 * Uygulamayı açık simülatörde başlatır.
 *
 * Timeout yok: süreç kaydı bitirene kadar kasıtlı olarak yaşıyor. `detached`
 * şart — `expo run:ios` Metro'yu alt süreç olarak doğuruyor ve grup öldürülmezse
 * Metro arkada kalıyor.
 */
async function runOnSimulator(projectPath: string): Promise<SimulatorRun> {
  const app = runProcess(expoBinPath(projectPath, EXPO_MISSING_BUILD), ["run:ios"], {
    cwd: projectPath,
    detached: true,
  });
  return {
    waitUntilLaunched: async (timeoutMs) => {
      await app.waitForOutput(/Opening on/, timeoutMs, "Build/kurulum");
    },
    stop: () => app.stop(),
  };
}

export const expoAdapter: ProjectAdapter = {
  kind: "expo",
  readAppInfo,
  syncNative,
  startDevServer: (projectPath: string): Promise<DevServer> => devServer.start(projectPath),
  runOnDevice,
  runOnSimulator,
  // Expo bugün her komutu destekliyor; kısıtlama RN CLI adapter'ıyla gelecek.
  supports: () => true,
};
