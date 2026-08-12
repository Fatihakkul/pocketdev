import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Native projenin JS bağımlılıklarıyla eşitlenip eşitlenmediğini izleyen damga.
 *
 * Bu mantık proje tipinden bağımsız: Expo'da eşitleme `expo prebuild`, RN CLI'da
 * `pod install` ile yapılır ama "ne zaman gerekli" kararı ikisinde de aynıdır.
 * Bu yüzden komut adapter'da, karar burada duruyor.
 */

/** Native projenin hangi girdilerle üretildiğini tutan damga (build/ altında). */
const STAMP_FILE = "prebuild-stamp.json";

/**
 * Native tarafa yansıması gereken dosyalar. Liste proje tipine göre değişiyor:
 * Expo'da bağımlılıklar + config plugin'ler (`app.json`), RN CLI'da bağımlılıklar
 * + `ios/Podfile` (config plugin yok, native proje commit'li). Karar mantığı
 * ikisinde de aynı olduğu için yalnızca bu liste adapter'dan geliyor.
 */
export const EXPO_INPUTS = ["package.json", "app.json"];
export const RN_CLI_INPUTS = ["package.json", path.join("ios", "Podfile")];

/** Verilen girdi dosyalarının içerik özeti. */
export function nativeInputsHash(projectPath: string, inputs: string[]): string {
  const hash = crypto.createHash("sha1");
  for (const name of inputs) {
    try {
      hash.update(fs.readFileSync(path.join(projectPath, name)));
    } catch {
      // dosya yoksa boş katkı: yokluğu da özetin parçası
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

function stampPath(projectPath: string): string {
  return path.join(projectPath, "build", STAMP_FILE);
}

function readStampHash(projectPath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(stampPath(projectPath), "utf-8"));
    return typeof parsed?.hash === "string" ? parsed.hash : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Damga yoksa (bu kontrol eklenmeden önce kurulmuş projeler) `Podfile.lock`'un
 * tarihine bakıyoruz: ondan sonra değişmiş bir package.json/app.json, native
 * tarafa hiç yansımamış bir bağımlılık ya da plugin var demek.
 */
function staleAgainstPodfileLock(projectPath: string, inputs: string[]): boolean {
  const lockPath = path.join(projectPath, "ios", "Podfile.lock");
  if (!fs.existsSync(lockPath)) return true;

  const lockTime = fs.statSync(lockPath).mtimeMs;
  return inputs.some((name) => {
    const inputPath = path.join(projectPath, name);
    return fs.existsSync(inputPath) && fs.statSync(inputPath).mtimeMs > lockTime;
  });
}

/** Native projenin yeniden üretilmesi gerekiyor mu? */
export function needsSync(
  projectPath: string,
  inputs: string[],
  currentHash = nativeInputsHash(projectPath, inputs)
): boolean {
  if (!fs.existsSync(path.join(projectPath, "ios"))) return true;

  const stamped = readStampHash(projectPath);
  return stamped === undefined ? staleAgainstPodfileLock(projectPath, inputs) : stamped !== currentHash;
}

/**
 * Damgayı eşitleme BİTTİKTEN sonra yazar: eşitleme kendi girdilerini
 * değiştirebiliyor (ör. eksik bağımlılığı package.json'a yazması), ve o durumda
 * önceden alınan özet bir sonraki build'de gereksiz bir eşitleme daha tetiklerdi.
 */
export function writeStamp(projectPath: string, inputs: string[]): void {
  fs.mkdirSync(path.dirname(stampPath(projectPath)), { recursive: true });
  fs.writeFileSync(
    stampPath(projectPath),
    JSON.stringify({ hash: nativeInputsHash(projectPath, inputs), at: new Date().toISOString() }, null, 2)
  );
}
