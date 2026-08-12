import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Kanal üzerinden açılan Claude oturumlarının izin ve sandbox politikası.
 *
 * ÖNEMLİ: buradaki hiçbir şey kullanıcının kendi interaktif Claude Code
 * oturumunu etkilemez. Politika yalnızca `claudeRunner`'ın `--settings` ile
 * spawn ettiği sürece veriliyor; `~/.claude/settings.json` ve proje içi
 * `.claude/settings.json` el değmeden kalıyor. Aynı sebeple ileride hook
 * eklenirse o da bu inline JSON'a girmeli, proje ayar dosyasına değil.
 *
 * İki katman birlikte çalışıyor ve ikisi de gerekli:
 *   1. `sandbox.*`  → macOS'ta seatbelt, yani çekirdek seviyesinde zorlama.
 *      Bash ile çalıştırılan komutları bağlar.
 *   2. `permissions.deny` → Claude'un kendi `Read`/`Edit`/`Write` araçlarını
 *      bağlar. Bunlar CLI sürecinin içinde çalışır, seatbelt onlara ulaşmaz;
 *      yalnızca sandbox yazmak `cat` yerine `Read` kullanan bir oturuma
 *      hiçbir engel koymazdı.
 */

/** Ar-Ge sırasında Claude'un okuyabileceği dokümantasyon siteleri. */
export const ALLOWED_WEB_DOMAINS = [
  "github.com",
  "raw.githubusercontent.com",
  "gist.github.com",
  "stackoverflow.com",
  "npmjs.com",
  "developer.mozilla.org",
  "reactnative.dev",
  "docs.expo.dev",
  "nodejs.org",
  "typescriptlang.org",
  "react.dev",
  "web.dev",
  "css-tricks.com",
  "w3schools.com",
  "devdocs.io",
  "freecodecamp.org",
  "expressjs.com",
  "mongoosejs.com",
  "prisma.io",
];

/**
 * Paket kurulumu ve git için gereken uçlar. Bunlar okuma değil ARAÇ trafiği:
 * ağ kısıtı yerel bir HTTP/SOCKS proxy ile uygulandığı için proxy'yi
 * onurlandıran araçlar (curl, git, npm) buradan geçer. Node'un global
 * `fetch`'i proxy'yi umursamadığından allowlist'te olsa bile geçemez —
 * bu, exfiltration denemelerine karşı kazanılmış bir yan etki.
 */
const TOOLCHAIN_DOMAINS = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
];

/**
 * Sır barındıran, hiçbir projede işi olmayan yollar. Hem sandbox hem araç
 * katmanında reddediliyor.
 */
export function secretPaths(): string[] {
  const home = os.homedir();
  const bridgeRoot = process.cwd();
  return [
    path.join(home, ".ssh"),
    path.join(home, ".aws"),
    path.join(home, ".gnupg"),
    path.join(home, ".docker"),
    path.join(home, ".config/gh"),
    path.join(home, ".npmrc"),
    path.join(home, "Library/Keychains"),
    // Claude'un kendi kimlik bilgileri ve oturum geçmişi. CLI süreci bunları
    // sandbox dışında okumaya devam eder; kapatılan şey oturumun kendi
    // kimliğini okuyup dışarı taşıması.
    path.join(home, ".claude"),
    // Botun kendi sırları: BOT_TOKEN, oturum kimlikleri, kullanım geçmişi.
    path.join(bridgeRoot, ".env"),
    path.join(bridgeRoot, "data"),
  ];
}

/**
 * Aktif projenin kardeşlerini tek tek reddeder.
 *
 * Denylist'te "şu dizin hariç" diye bir ifade yok; ama kardeşleri çalışma
 * anında sayabildiğimiz için istisnaya ihtiyaç kalmıyor. Bu, raporda çıkan
 * "diğer 9 projeyi görebiliyorum" maddesini kapatan kısım — hem workspace
 * içindeki hem (bağlı proje ise) dışarıdaki kardeşler için çalışır.
 */
function siblingPaths(projectPath: string): string[] {
  const parent = path.dirname(projectPath);
  const self = path.basename(projectPath);
  try {
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== self && !entry.name.startsWith("."))
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

function globs(paths: string[]): string[] {
  return paths.flatMap((target) => [target, `${target}/**`]);
}

/**
 * İzin kurallarında yol sözdizimi sandbox'tan FARKLI: tek eğik çizgi workspace
 * kökünü, çift eğik çizgi dosya sistemi kökünü gösteriyor. Bu ayrım ölçümle
 * bulundu — `Read(/Users/.../.ssh/**)` yazıldığında kural `<proje>/Users/...`
 * olarak yorumlanıyor, hiç eşleşmiyor ve `~/.ssh` sessizce okunabiliyordu.
 * `sandbox.filesystem.*` tarafında ise tek eğik çizgili mutlak yol doğru.
 */
function toRulePath(target: string): string {
  return target.startsWith("/") ? `/${target}` : target;
}

export interface SandboxPolicy {
  /** Okumaya kapatılan yollar — kanarya testi de bu listeden besleniyor. */
  deniedReadPaths: string[];
  settings: string;
}

export function buildPolicy(projectPath: string): SandboxPolicy {
  const deniedReadPaths = [...secretPaths(), ...siblingPaths(projectPath)];
  const denyGlobs = globs(deniedReadPaths);

  const settings = {
    permissions: {
      allow: [
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "Bash",
        "Skill",
        ...ALLOWED_WEB_DOMAINS.map((domain) => `WebFetch(domain:${domain})`),
      ],
      // Araç katmanı: seatbelt'in ulaşamadığı `Read`/`Edit`/`Write` çağrıları.
      deny: [
        ...denyGlobs
          .map(toRulePath)
          .flatMap((glob) => [`Read(${glob})`, `Edit(${glob})`, `Write(${glob})`]),
        // Sandbox komutu değil niyeti bilmediği için bunlar araç katmanında
        // kalıyor: build/dağıtım yalnızca kullanıcının tetiklediği runner'lardan
        // yapılır, git'i değiştiren işlemler kullanıcının kendi kontrolünde.
        "Bash(eas build*)",
        "Bash(eas submit*)",
        "Bash(npx eas build*)",
        "Bash(npx eas submit*)",
        "Bash(git add*)",
        "Bash(git commit*)",
        "Bash(git push*)",
        "Bash(git pull*)",
        "Bash(git merge*)",
        "Bash(git rebase*)",
        "Bash(git reset*)",
        "Bash(git checkout*)",
        "Bash(git restore*)",
        "Bash(git stash*)",
        "Bash(git branch*)",
        "Bash(git tag*)",
        "Bash(git rm*)",
        "Bash(git mv*)",
        "Bash(git clean*)",
        "Bash(git cherry-pick*)",
        "Bash(git revert*)",
        "Bash(git apply*)",
        "Bash(git am*)",
        "Bash(git init*)",
      ],
    },
    sandbox: {
      enabled: true,
      // Sandbox uygulanamıyorsa sessizce korumasız çalışmak yerine hata ver.
      failIfUnavailable: true,
      // Botta onay verecek kimse yok: sandbox dışında çalışması gereken bir
      // komut istemek yerine reddedilsin.
      allowUnsandboxedCommands: false,
      filesystem: {
        denyRead: denyGlobs,
        denyWrite: denyGlobs,
      },
      network: {
        allowedDomains: [...ALLOWED_WEB_DOMAINS, ...TOOLCHAIN_DOMAINS],
        // Listede olmayan host'u sormadan reddet — soracak kullanıcı yok.
        strictAllowlist: true,
      },
    },
  };

  return { deniedReadPaths, settings: JSON.stringify(settings) };
}
