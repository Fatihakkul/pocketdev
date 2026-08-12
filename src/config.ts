import "dotenv/config";
import os from "node:os";
import path from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const workspaceRootRaw = process.env.WORKSPACE_ROOT ?? "./workspace";

/**
 * Artık zorunlu değil. Verilmezse sahiplik ilk kurulumda `/claim <kod>` ile
 * belirleniyor (bkz. `channels/ownership.ts`) — kullanıcının kendi sayısal
 * Telegram id'sini üçüncü parti bir bottan öğrenmesi gerekmiyor. Verilirse
 * ona saygı gösteriliyor ve sahiplik sabitleniyor.
 */
const allowedUserIdRaw = process.env.ALLOWED_USER_ID?.trim();

/**
 * App Store Connect API anahtarı — eksik ad-hoc dağıtım profilini `xcodebuild`'in
 * kendisine ürettirmek için (bkz. `platform/ios/ipaExporter.ts`).
 *
 * İsteğe bağlı: verilmezse davranış eskisi gibi, profil elle üretilmek zorunda.
 * `.p8` yolu verilmezse Apple araçlarının standart konumu varsayılıyor.
 */
const ascKeyId = process.env.ASC_KEY_ID?.trim();
const ascIssuerId = process.env.ASC_ISSUER_ID?.trim();
const ascKeyPath = process.env.ASC_KEY_PATH?.trim();

export interface AppStoreConnectCredentials {
  keyId: string;
  issuerId: string;
  keyPath: string;
}

const appStoreConnect: AppStoreConnectCredentials | undefined =
  ascKeyId && ascIssuerId
    ? {
        keyId: ascKeyId,
        issuerId: ascIssuerId,
        keyPath:
          ascKeyPath ?? path.join(os.homedir(), ".appstoreconnect", "private_keys", `AuthKey_${ascKeyId}.p8`),
      }
    : undefined;

/**
 * Arayüz dili. Varsayılan İngilizce — proje açık kaynak ve okuyucusunun büyük
 * kısmı Türkçe bilmiyor. Tanınmayan bir değer sessizce yok sayılıyor: dil
 * ayarı yüzünden botun hiç açılmaması orantısız olurdu.
 */
const localeRaw = process.env.LOCALE?.trim().toLowerCase();
const locale: "en" | "tr" = localeRaw === "tr" ? "tr" : "en";

export const config = {
  locale,
  /**
   * Tembel: token yalnızca botu ayağa kaldıran `index.ts` okuyor. Eager
   * okunursa `config`'i dolaylı olarak import eden her modül — dolayısıyla
   * testlerin çoğu — `.env` olmadan çöküyor, yani suite'i çalıştırmak için
   * gerçek bir Telegram token'ı gerekiyordu. Hata yine aynı anda ve aynı
   * mesajla çıkıyor, sadece import anında değil kullanım anında.
   */
  get botToken(): string {
    return requireEnv("BOT_TOKEN");
  },
  allowedUserId: allowedUserIdRaw ? Number(allowedUserIdRaw) : undefined,
  appStoreConnect,
  workspaceRoot: path.resolve(process.cwd(), workspaceRootRaw),
  templatesRoot: path.resolve(process.cwd(), "templates"),
  scratchDir: path.resolve(process.cwd(), "scratch"),
  stateFile: path.resolve(process.cwd(), "data", "state.json"),
};

if (config.allowedUserId !== undefined && !Number.isInteger(config.allowedUserId)) {
  throw new Error("ALLOWED_USER_ID must be a numeric Telegram user id");
}
