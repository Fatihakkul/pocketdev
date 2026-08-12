import fs from "node:fs";
import path from "node:path";

/**
 * React Native CLI'ın kendisi ve sürüme göre değişen bayrakları.
 *
 * Expo adapter'ında karşılığı `expoBinPath`; burada ek olarak bir sürüm dalı var
 * çünkü RN CLI build konfigürasyonu bayrağını 0.73'te yeniden adlandırdı.
 */

const RN_MISSING = "react-native CLI bulunamadı. Bağımlılıkların kurulu olduğundan emin ol (npm install).";

/** `node_modules/.bin/react-native`; yoksa anlaşılır hata. */
export function reactNativeBin(projectPath: string): string {
  const bin = path.join(projectPath, "node_modules", ".bin", "react-native");
  if (!fs.existsSync(bin)) {
    throw new Error(RN_MISSING);
  }
  return bin;
}

/** package.json'daki `react-native` sürümü; okunamazsa `undefined`. */
export function readReactNativeVersion(projectPath: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    const range = pkg?.dependencies?.["react-native"] ?? pkg?.devDependencies?.["react-native"];
    return typeof range === "string" ? range : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Debug/Release'i seçen bayrak. RN CLI 0.73'te `--configuration` yerine `--mode`
 * geldi ve eskisi kaldırıldı; iki sürümde de aynı bayrağı göndermek build'i
 * "unknown option" ile düşürüyor.
 *
 * Aralık okunamazsa yeni bayrak varsayılıyor: 0.73 Aralık 2023'te çıktı, bugün
 * kurulan her proje onun üstünde.
 */
export function buildModeFlag(versionRange: string | undefined): "--mode" | "--configuration" {
  const match = versionRange?.match(/(\d+)\.(\d+)/);
  if (!match) return "--mode";

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major > 0) return "--mode"; // 1.x geldiğinde de yeni bayrak
  return minor >= 73 ? "--mode" : "--configuration";
}
