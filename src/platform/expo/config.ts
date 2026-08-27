import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { m } from "../../i18n/index.js";

/**
 * Expo projesinin **çözümlenmiş** yapılandırmasını okur.
 *
 * `app.json` dört olasılıktan yalnızca biri. Expo'nun kendi çözümlemesi
 * (`@expo/config` `Config.js:320-334`) şöyle:
 *
 *   dinamik: app.config.{ts,mts,cts,mjs,cjs,js}   ← varsa statik olanı ARGÜMAN
 *                                                    alır ve üzerine yazabilir
 *   statik:  app.config.json ?? app.json
 *
 * Yani `app.json`'ı doğrudan okumak üç şekilde yanılıyor: dosya hiç olmayabilir,
 * `app.config.json` olabilir, ya da ikisi birden varken dinamik config
 * değerleri ezmiş olabilir. Sonuncusu en kötüsü — sessizce yanlış bundleId
 * okunur ve yanlış imzalama profili seçilir.
 */

/** `resolveFrom(root, './app.config')`'in denediği uzantılar, aynı sırayla. */
const DYNAMIC_CONFIG_EXTS = [".ts", ".mts", ".cts", ".mjs", ".cjs", ".js"];

const DYNAMIC_CONFIG_FILES = DYNAMIC_CONFIG_EXTS.map((ext) => `app.config${ext}`);

/** Statik config; Expo `app.config.json`'a `app.json`'dan önce bakıyor. */
const STATIC_CONFIG_FILES = ["app.config.json", "app.json"];

/**
 * Bir Expo config'ini etkileyebilecek tüm dosyalar. `nativeSync` bunu girdi
 * listesi olarak, önbellek ise tazelik anahtarı olarak kullanıyor.
 */
export const EXPO_CONFIG_FILES = [...DYNAMIC_CONFIG_FILES, ...STATIC_CONFIG_FILES];

/**
 * Varlığı tek başına "bu bir Expo projesi" demeye yeten dosyalar.
 *
 * `app.json` bilerek DIŞARIDA: React Native CLI projelerinde de `app.json` var
 * (uygulama adını taşıyor) ve onu buraya koymak RN CLI projelerini Expo diye
 * sınıflandırırdı — Expo adapter'ı listede önce geliyor. `app.json` için doğru
 * sinyal dosyanın varlığı değil, içindeki `expo` anahtarı.
 */
export const EXPO_SPECIFIC_CONFIG_FILES = [...DYNAMIC_CONFIG_FILES, "app.config.json"];

/** Çözümlenmiş config — `app.json`'daki `.expo` nesnesinin tam karşılığı. */
export type ExpoConfig = Record<string, any>;

const CONFIG_TIMEOUT_MS = 60 * 1000;

interface CacheEntry {
  key: string;
  config: ExpoConfig;
}

const cache = new Map<string, CacheEntry>();

function firstExisting(projectPath: string, names: string[]): string | undefined {
  return names.find((name) => fs.existsSync(path.join(projectPath, name)));
}

/** Projede dinamik (JS/TS) bir config var mı — varsa statik okuma eksik kalır. */
export function hasDynamicConfig(projectPath: string): boolean {
  return firstExisting(projectPath, DYNAMIC_CONFIG_FILES) !== undefined;
}

/**
 * Önbellek anahtarı: aday config dosyalarının + `package.json`'ın mtime'ları.
 *
 * `detectProjectKind`'daki gerekçenin aynısı — kullanıcı proje içinde dosya
 * değiştirebiliyor, sonuç kalıcı olarak önbelleğe alınamaz. Dosya dokunulunca
 * anahtar değişir ve config yeniden çözümlenir.
 */
function freshnessKey(projectPath: string): string {
  return [...EXPO_CONFIG_FILES, "package.json"]
    .map((name) => {
      try {
        return `${name}:${fs.statSync(path.join(projectPath, name)).mtimeMs}`;
      } catch {
        return `${name}:-`;
      }
    })
    .join("|");
}

/**
 * Statik config'i doğrudan okur. Dinamik config yoksa bu tam doğru sonuç verir;
 * varsa eksiktir (override'ları göremez), çağıran ona göre uyarıyor.
 */
function readStaticConfig(projectPath: string): ExpoConfig | undefined {
  const name = firstExisting(projectPath, STATIC_CONFIG_FILES);
  if (!name) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectPath, name), "utf-8"));
    return parsed?.expo ?? parsed ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Proje-yerel Expo CLI'sini çalıştırır.
 *
 * `expo config --json`, `--type` verilmediğinde
 * `getConfig(root, { skipSDKVersionRequirement: true })` sonucunun `.exp`
 * alanını basıyor (`@expo/cli` `config/configAsync.js:159-176`) — aradığımız
 * çözümlenmiş nesne tam olarak bu.
 *
 * `--type public` KULLANMIYORUZ: private alanları kırpıyor ve `extra.eas.projectId`
 * bize lazım (bkz. qaBuildRunner).
 *
 * Projenin kendi Expo sürümünü kullanmak bilinçli: `@expo/config`'i pocketdev'e
 * bağımlılık olarak eklemek, projenin SDK'sıyla sürüm uyuşmazlığı riski demek.
 */
async function resolveWithCli(projectPath: string, expoBin: string): Promise<ExpoConfig> {
  const { stdout } = await execa(expoBin, ["config", "--json"], {
    cwd: projectPath,
    timeout: CONFIG_TIMEOUT_MS,
  });
  // `--json` stdout'u susturuyor ama yine de temkinli davranıp ilk `{`'tan
  // başlıyoruz: araya bir uyarı sızarsa parse patlamasın.
  const start = stdout.indexOf("{");
  if (start === -1) throw new Error(m().runtime.expoConfigUnreadable);
  return JSON.parse(stdout.slice(start));
}

/**
 * Çözümlenmiş Expo config'i döner.
 *
 * Sıra: proje-yerel `expo config --json` → statik dosya → hata.
 * Bağımlılıklar kurulu değilken de `/doctor` gibi salt bilgi veren komutlar
 * çalışabilsin diye statik fallback korunuyor.
 */
export async function readExpoConfig(projectPath: string): Promise<ExpoConfig> {
  const key = freshnessKey(projectPath);
  const cached = cache.get(projectPath);
  if (cached?.key === key) return cached.config;

  const expoBin = path.join(projectPath, "node_modules", ".bin", "expo");
  let config: ExpoConfig | undefined;

  if (fs.existsSync(expoBin)) {
    try {
      config = await resolveWithCli(projectPath, expoBin);
    } catch {
      // CLI patladıysa (bozuk app.config.js, eksik peer dependency, timeout)
      // statik okumaya düşüyoruz — eksik ama hiç yoktan iyi.
      config = undefined;
    }
  }

  config ??= readStaticConfig(projectPath);

  if (!config) {
    throw new Error(
      hasDynamicConfig(projectPath)
        ? m().runtime.expoConfigNeedsInstall
        : m().runtime.expoConfigMissing
    );
  }

  cache.set(projectPath, { key, config });
  return config;
}

/**
 * Native tarafa yansıyan her şeyin özeti: bağımlılıklar + çözümlenmiş config.
 *
 * Ham dosya içeriğini değil **çözümlenmiş** config'i hash'lemek şart: dinamik
 * bir config plugin listesini `.env`'den ya da başka bir dosyadan üretebiliyor,
 * o durumda `app.config.js`'in kendisi hiç değişmeden native taraf değişiyor.
 */
export async function expoNativeInputsHash(projectPath: string): Promise<string> {
  const hash = crypto.createHash("sha1");
  try {
    hash.update(fs.readFileSync(path.join(projectPath, "package.json")));
  } catch {
    // dosya yoksa boş katkı: yokluğu da özetin parçası
  }
  hash.update("\0");
  hash.update(JSON.stringify(await readExpoConfig(projectPath)));
  return hash.digest("hex");
}

/**
 * Projede `expo-dev-client` bağımlılık olarak var mı?
 *
 * İki karar buna bağlı ve ikisi de yanlış olduğunda sessizce kırılıyor:
 * `/preview` dev launcher deep link'i mi yoksa Expo Go linki mi üreteceğine,
 * `/otabuild dev` ise ürettiği Debug build'in tünele yönlendirilebilir olup
 * olmadığına. Paket yoksa Debug build'de dev launcher hiç bulunmuyor ve
 * uygulama içine gömülü Metro adresine bakıyor.
 */
export function hasDevClient(projectPath: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    return Boolean(pkg?.dependencies?.["expo-dev-client"] ?? pkg?.devDependencies?.["expo-dev-client"]);
  } catch {
    return false;
  }
}

/** Testler için; süreç ömrü boyunca tutulan önbelleği temizler. */
export function clearExpoConfigCache(): void {
  cache.clear();
}
