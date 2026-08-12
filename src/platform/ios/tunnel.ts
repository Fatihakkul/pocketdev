import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import { m } from "../../i18n/index.js";

const REACHABLE_POLL_INTERVAL_MS = 2000;

/** Kaydolmuş tunnel için: sorun yalnızca DNS yayılması, beklemeye değer. */
const REGISTERED_TIMEOUT_MS = 180_000;
/** Kaydolmamış tunnel için: beklemenin faydası yok, yenisini denemek gerekir. */
const UNREGISTERED_TIMEOUT_MS = 45_000;
const URL_TIMEOUT_MS = 60_000;
/**
 * Funnel için: makinenin ts.net sertifikası ilk kez ACME ile alınıyorsa
 * dakikalar sürebiliyor ve o süre boyunca TLS el sıkışması hiç kurulmuyor.
 * Sonraki açılışlar anında olduğu için bu bütçe pratikte yalnızca ilk seferi
 * etkiliyor.
 */
const TAILSCALE_TIMEOUT_MS = 240_000;
const CLOUDFLARED_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5000;

const TRYCLOUDFLARE_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

/**
 * TryCloudflare hesapsız tunnel oluşturmayı IP başına sınırlıyor; sınıra
 * takılınca `error code: 1015` ve `429 Too Many Requests` dönüyor. Bu durumda
 * yeniden denemek her seferinde sınırdan bir hak daha yakıyor.
 */
const RATE_LIMITED = /error code: 1015|429 Too Many Requests/;

export interface Tunnel {
  publicUrl: string;
  stop(): Promise<void>;
}

export type TunnelProvider = "tailscale" | "cloudflared";

export function selectedProvider(): TunnelProvider {
  return process.env.OTA_TUNNEL === "cloudflared" ? "cloudflared" : "tailscale";
}

export interface TunnelOptions {
  /**
   * Tünelin gerçekten trafik taşıdığını doğrulamak için istenecek yol.
   *
   * Varsayılan `/` her servis için doğru DEĞİL: kontrol 2xx bekliyor ve Metro
   * kök yolunu servis etmiyor (`HEAD /` → 404). 2026-08-12'de `/preview` tam
   * bu yüzden 4 dakika bekleyip "erişilebilir olmadı" dedi — tünel baştan beri
   * çalışıyordu. OTA sunucusu `/`'da kurulum sayfası verdiği için orada
   * varsayılan geçerli; Metro için `/status` kullanılıyor.
   */
  healthPath?: string;
  onAttemptFailed?: (attempt: number, total: number, message: string) => void;
}

export async function openTunnel(port: number, logPath: string, options: TunnelOptions = {}): Promise<Tunnel> {
  const healthPath = options.healthPath ?? "/";
  return selectedProvider() === "cloudflared"
    ? openCloudflared(port, logPath, healthPath, options.onAttemptFailed)
    : openTailscale(port, logPath, healthPath);
}

/**
 * Adres hazır olduğu anda DNS'te henüz çözülmüyor olabilir; beklemeden
 * kullanılırsa hem `.ipa` export'u hem de kullanıcının tıkladığı link
 * "host bulunamadı" veriyor.
 */
async function waitUntilReachable(url: string, healthPath: string, budgetMs: () => number): Promise<void> {
  const target = new URL(healthPath, url).toString();
  const start = Date.now();
  let lastStatus: number | undefined;
  for (;;) {
    try {
      const res = await fetch(target, { method: "HEAD" });
      if (res.ok) return;
      lastStatus = res.status;
    } catch {
      // henüz yayılmadı, denemeye devam
    }
    if (Date.now() - start >= budgetMs()) {
      // Durum kodunu mesaja koymak şart: "erişilemedi" ile "erişildi ama 404"
      // tamamen farklı iki sorun ve ikincisi yol yanlış demek.
      const detail =
        lastStatus === undefined ? m().tunnel.noConnection : m().tunnel.lastStatus(lastStatus);
      throw new Error(m().tunnel.unreachable(target, detail));
    }
    await new Promise((resolve) => setTimeout(resolve, REACHABLE_POLL_INTERVAL_MS));
  }
}

// ---------------------------------------------------------------------------
// Tailscale Funnel — varsayılan sağlayıcı
// ---------------------------------------------------------------------------

export interface TailscaleStatus {
  BackendState?: string;
  Self?: {
    DNSName?: string;
    /**
     * Düğüme tanınan yetenekler. Funnel için gereken iki admin konsolu ayarı
     * burada görünüyor: `https` (HTTPS sertifikaları açık) ve `funnel` (ACL bu
     * makineye izin veriyor). Üst seviyedeki `Capabilities` dizisi aynı bilgiyi
     * taşıyor ama Tailscale onu kullanımdan kaldırdı (tailscale#11508).
     */
    CapMap?: Record<string, unknown>;
  };
}

/**
 * Durumun Funnel için yeterli olup olmadığını söyler: sorun varsa kullanıcıya
 * gösterilecek mesajı, yoksa `undefined` döner.
 *
 * Süreçten ayrı saf fonksiyon, test edilebilsin diye.
 *
 * **Bilinmeyeni sorun saymıyor.** `CapMap` yoksa (eski tailscale sürümü, ya da
 * alan adının ileride değişmesi) yetenek kontrolü atlanıyor. Ön kontrolün
 * yanlış pozitifi, çalışan bir kurulumu build'e hiç başlatmadan reddetmek
 * demek olurdu — bu, çözdüğü sorundan daha kötü.
 */
export function describeTailscaleReadiness(status: TailscaleStatus): string | undefined {
  if (status.BackendState !== "Running") {
    return m().tunnel.notLoggedIn(status.BackendState ?? "unknown");
  }

  if (!status.Self?.DNSName) {
    return m().tunnel.noMachineName;
  }

  const caps = status.Self.CapMap;
  if (!caps) return undefined;

  if (!("https" in caps)) {
    return m().tunnel.httpsDisabled;
  }

  if (!("funnel" in caps)) {
    return m().tunnel.funnelNotAllowed;
  }

  return undefined;
}

async function readTailscaleStatus(): Promise<TailscaleStatus> {
  const { stdout, exitCode } = await execa("tailscale", ["status", "--json"], { reject: false });
  if (exitCode !== 0) {
    throw new Error(m().tunnel.daemonUnreachable);
  }

  try {
    return JSON.parse(stdout) as TailscaleStatus;
  } catch {
    throw new Error(m().tunnel.statusUnreadable);
  }
}

/**
 * Tüneli AÇMADAN sağlayıcının kullanılabilir olduğunu doğrular.
 *
 * Sebebi `/otabuild`'in sırası: archive → tunnel → export. Ad-hoc profil zaten
 * archive'dan önce kontrol ediliyor ("profil eksikse 20 dakikalık archive'ı
 * bekleyip sonda patlamak anlamsız"), ama tünel için aynısı yapılmıyordu —
 * Funnel'ı açmamış kullanıcı 4,5 dakika archive bekleyip ondan sonra
 * patlıyordu. Aynı gerekçe iki koşula da uyuyor.
 */
export async function preflight(): Promise<void> {
  if (selectedProvider() === "cloudflared") {
    const { exitCode } = await execa("cloudflared", ["--version"], { reject: false });
    if (exitCode !== 0) {
      throw new Error(m().tunnel.cloudflaredMissing);
    }
    return;
  }

  const problem = describeTailscaleReadiness(await readTailscaleStatus());
  if (problem) throw new Error(problem);
}

/**
 * Funnel, TryCloudflare'in aksine kalıcı bir servis: adres makineye sabit
 * (`<makine>.<tailnet>.ts.net`) ve her build'de yeniden "oluşturulmuyor", yani
 * quick tunnel'ları vuran IP başına oluşturma kotası burada yok.
 */
async function openTailscale(port: number, logPath: string, healthPath: string): Promise<Tunnel> {
  const hostname = await resolveTailscaleHostname();
  const publicUrl = `https://${hostname}`;

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFile = fs.createWriteStream(logPath, { flags: "a" });

  // `--bg` şart: ön planda çalıştırılan `tailscale funnel` yapılandırmayı kalıcı
  // serve config'e YAZMIYOR (`tailscale funnel status` → "No serve config") ve
  // sertifika makinesi bu yüzden "Funnel is not enabled for ...:443" deyip
  // ACME doğrulamasını başarısız sayıyor. `--bg` ile yapılandırma gerçekten
  // kaydoluyor; karşılığında kapatmayı biz üstleniyoruz.
  const funnel = execa("tailscale", ["funnel", "--bg", String(port)], { env: process.env, reject: false });

  // Çıktıyı biriktiriyoruz: `tailscale funnel` eksik ayarı ve onu açacak linki
  // doğrudan yazdırıyor. Bu bilgi yalnızca log dosyasında kalırsa Telegram'a
  // "erişilebilir olmadı" gibi işe yaramaz bir mesaj gidiyor.
  let output = "";
  const collect = (chunk: unknown): void => {
    const text = String(chunk);
    output += text;
    logFile.write(text);
  };
  funnel.stdout?.on("data", collect);
  funnel.stderr?.on("data", collect);
  void Promise.resolve(funnel).finally(() => logFile.end());

  // `--bg` yapılandırması süreç bitince kendiliğinden kalkmıyor; açıkça
  // kapatmazsak funnel açık kalır ve tailscaled sertifika denemelerini
  // sürdürür (bu, Let's Encrypt kotasını sürekli dolu tutan kısır döngüyü
  // besliyor).
  const stop = async (): Promise<void> => {
    funnel.kill("SIGTERM");
    await execa("tailscale", ["funnel", "--https=443", "off"], { reject: false });
  };

  try {
    // Funnel'da "kayıt" aşaması yok, ama makinenin ts.net sertifikası ilk kez
    // ACME ile alınıyorsa bu dakikalar sürebiliyor ve o süre boyunca TLS
    // el sıkışması hiç kurulmuyor. Sertifika bir kez alındıktan sonra açılış
    // anında oluyor, bu yüzden cömert bir bütçe yalnızca ilk seferi etkiler.
    await waitUntilReachable(publicUrl, healthPath, () => TAILSCALE_TIMEOUT_MS);
    return { publicUrl, stop };
  } catch (error) {
    await stop();
    throw new Error(describeFunnelFailure(error as Error, output, logPath, await readTailscaleHealth()));
  }
}

/**
 * tailscaled'in sağlık uyarılarını okur. Sertifika beklenirken tek belirti bu —
 * `tailscale funnel` hiçbir hata basmadan sessizce bekliyor, bağlantı ise zaman
 * aşımına uğruyor. Bu satır olmadan hata "erişilebilir olmadı"da kalıyor.
 */
async function readTailscaleHealth(): Promise<string[]> {
  const { stdout, exitCode } = await execa("tailscale", ["status", "--json"], { reject: false });
  if (exitCode !== 0) return [];
  try {
    const parsed = JSON.parse(stdout) as { Health?: string[] };
    return parsed.Health ?? [];
  } catch {
    return [];
  }
}

function describeFunnelFailure(error: Error, output: string, logPath: string, health: string[]): string {
  const setupLink = /https:\/\/login\.tailscale\.com\/\S+/.exec(output)?.[0];
  if (setupLink) {
    const reason = output.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "Funnel unavailable.";
    return m().tunnel.enableVia(reason, setupLink);
  }

  const certPending = health.find((h) => /ACME|certificate/i.test(h));
  if (certPending) {
    return m().tunnel.certPending(certPending, tailscaledLogHint());
  }

  return m().tunnel.genericFailure(error.message, logPath, tailscaledLogHint());
}

/**
 * tailscaled log dosyasının yeri kuruluma göre değişiyor: Apple Silicon
 * Homebrew `/opt/homebrew`, Intel `/usr/local`, Mac App Store sürümü ise hiç
 * bu dosyayı yazmıyor. Sabit yol yazmak, kullanıcıyı var olmayan bir dosyaya
 * yollamak demekti.
 */
function tailscaledLogHint(): string {
  const candidates = ["/opt/homebrew/var/log/tailscaled.log", "/usr/local/var/log/tailscaled.log"];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ?? m().tunnel.logHintFallback;
}

async function resolveTailscaleHostname(): Promise<string> {
  const status = await readTailscaleStatus();

  const problem = describeTailscaleReadiness(status);
  if (problem) throw new Error(problem);

  // describeTailscaleReadiness DNSName'i zaten doğruladı; buradaki kontrol
  // yalnızca tip daraltması için.
  const dnsName = status.Self?.DNSName?.replace(/\.$/, "");
  if (!dnsName) {
    throw new Error(m().tunnel.noMachineName);
  }
  return dnsName;
}

// ---------------------------------------------------------------------------
// cloudflared — yedek sağlayıcı (OTA_TUNNEL=cloudflared)
// ---------------------------------------------------------------------------

interface CloudflaredHandle {
  waitForUrl(): Promise<string>;
  isRegistered(): boolean;
  isRateLimited(): boolean;
  kill(): void;
}

async function openCloudflared(
  port: number,
  logPath: string,
  healthPath: string,
  onAttemptFailed?: (attempt: number, total: number, message: string) => void
): Promise<Tunnel> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= CLOUDFLARED_ATTEMPTS; attempt++) {
    const handle = spawnCloudflared(port, logPath);
    try {
      const url = await handle.waitForUrl();
      // Kaydolmuşsa sorun yalnızca yayılmadır ve beklemek doğrudur; kaydolmamışsa
      // beklemenin anlamı yok. Ölçümde bir tunnel 33 sn'de açıldı, yani sabit
      // kısa bir süreyle pes etmek çalışacak tunnel'ı öldürmek demekti.
      await waitUntilReachable(url, healthPath, () =>
        handle.isRegistered() ? REGISTERED_TIMEOUT_MS : UNREGISTERED_TIMEOUT_MS
      );
      return { publicUrl: url, stop: async () => handle.kill() };
    } catch (error) {
      lastError = error as Error;
      const wasRateLimited = handle.isRateLimited();
      handle.kill();
      if (wasRateLimited) throw lastError;

      onAttemptFailed?.(attempt, CLOUDFLARED_ATTEMPTS, lastError.message);
      if (attempt < CLOUDFLARED_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
      }
    }
  }

  throw new Error(
    `Tunnel ${CLOUDFLARED_ATTEMPTS} denemede açılamadı. Son hata: ${lastError?.message ?? "bilinmiyor"}\nLog: ${logPath}`
  );
}

function spawnCloudflared(port: number, logPath: string): CloudflaredHandle {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFile = fs.createWriteStream(logPath, { flags: "a" });

  const tunnel = execa("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`], {
    env: process.env,
    reject: false,
  });

  let url: string | undefined;
  let registered = false;
  let rateLimited = false;
  const urlWaiters: Array<(value: string) => void> = [];

  const onData = (chunk: unknown): void => {
    const text = String(chunk);
    logFile.write(text);
    if (text.includes("Registered tunnel connection")) registered = true;
    if (RATE_LIMITED.test(text)) rateLimited = true;

    const match = TRYCLOUDFLARE_URL.exec(text);
    if (match?.[0] && !url) {
      url = match[0];
      for (const resolve of urlWaiters.splice(0)) resolve(url);
    }
  };

  tunnel.stdout?.on("data", onData);
  tunnel.stderr?.on("data", onData);
  void Promise.resolve(tunnel).finally(() => logFile.end());

  return {
    isRegistered: () => registered,
    isRateLimited: () => rateLimited,
    kill: () => tunnel.kill("SIGTERM"),
    waitForUrl: () =>
      new Promise<string>((resolve, reject) => {
        if (url) return resolve(url);
        const timer = setTimeout(
          () => reject(new Error(`cloudflared adres üretmedi (${URL_TIMEOUT_MS / 1000}sn). Log: ${logPath}`)),
          URL_TIMEOUT_MS
        );
        urlWaiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
        void tunnel.then(() => {
          clearTimeout(timer);
          reject(
            new Error(
              rateLimited
                ? "TryCloudflare kota sınırına takıldı (Cloudflare 1015 / HTTP 429). " +
                  "Hesapsız quick tunnel'lar IP başına sınırlı."
                : `cloudflared beklenmedik şekilde sonlandı. Log: ${logPath}`
            )
          );
        });
      }),
  };
}
