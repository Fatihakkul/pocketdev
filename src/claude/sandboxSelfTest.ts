import path from "node:path";
import { execa } from "execa";
import { config } from "../config.js";
import { buildPolicy } from "./sandbox.js";

/** Kanarya kısa ve ucuz olmalı: tek soru, en küçük model. */
const SELFTEST_MODEL = "claude-haiku-4-5-20251001";
const SELFTEST_TIMEOUT_MS = 3 * 60 * 1000;

export interface SandboxStatus {
  verified: boolean;
  detail: string;
  checkedAt: number;
}

let status: SandboxStatus | undefined;

export function sandboxStatus(): SandboxStatus | undefined {
  return status;
}

/**
 * Sandbox'ın gerçekten uygulandığını ÖLÇER.
 *
 * Neden gerekli: yanlış yazılmış bir ayar anahtarı sessizce yok sayılıyor.
 * `failIfUnavailable` yalnızca sandbox'ın kurulamadığı durumu yakalar; anahtar
 * adı hatalıysa politika hiç yüklenmemiş olur ve biz korumalı olduğumuzu
 * sanırız. Tek gerçek doğrulama, engellenmesi gereken bir şeyi deneyip
 * engellendiğini görmek.
 *
 * Kanarya olarak botun kendi `data/` klasörü kullanılıyor: politika onu zaten
 * reddediyor, her kurulumda var ve içeriği testte hiç okunmuyor.
 */
export async function verifySandbox(): Promise<SandboxStatus> {
  // Açık rıza ile kapatılabilir; her bot açılışında küçük bir model koşusu
  // maliyeti var. Varsayılan AÇIK: kapalıyken korumasız çalışma riski,
  // koşunun maliyetinden büyük.
  if (process.env.SANDBOX_SELFTEST === "0") {
    status = { verified: true, detail: "Kanarya testi devre dışı (SANDBOX_SELFTEST=0).", checkedAt: Date.now() };
    return status;
  }

  const canary = path.join(process.cwd(), "data", "state.json");
  const { settings } = buildPolicy(config.scratchDir);

  const prompt =
    `\`cat ${canary}\` komutunu çalıştır. Dosyanın İÇERİĞİNİ ASLA yazma. ` +
    "Sadece tek kelime yanıtla: okuyabildiysen ERISILDI, izin reddedildiyse ENGELLENDI.";

  try {
    const { stdout } = await execa(
      "claude",
      [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--permission-mode",
        "acceptEdits",
        "--model",
        SELFTEST_MODEL,
        "--settings",
        settings,
      ],
      { cwd: config.scratchDir, timeout: SELFTEST_TIMEOUT_MS, reject: false }
    );

    const answer = String(JSON.parse(stdout)?.result ?? "").toUpperCase();
    if (answer.includes("ENGELLENDI")) {
      status = { verified: true, detail: "Kanarya dosyası okunamadı — sandbox uygulanıyor.", checkedAt: Date.now() };
    } else if (answer.includes("ERISILDI")) {
      status = {
        verified: false,
        detail: `Kanarya dosyası OKUNABİLDİ (${canary}). Sandbox politikası uygulanmıyor.`,
        checkedAt: Date.now(),
      };
    } else {
      status = { verified: false, detail: `Kanarya net yanıt vermedi: ${answer.slice(0, 120)}`, checkedAt: Date.now() };
    }
  } catch (error) {
    status = { verified: false, detail: `Kanarya çalıştırılamadı: ${(error as Error).message}`, checkedAt: Date.now() };
  }

  return status;
}
