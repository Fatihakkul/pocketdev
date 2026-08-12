import { execa } from "execa";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../../core/processRunner.js";
import { config, type AppStoreConnectCredentials } from "../../config.js";
import { m } from "../../i18n/index.js";

const ARCHIVE_TIMEOUT_MS = 30 * 60 * 1000;
const EXPORT_TIMEOUT_MS = 10 * 60 * 1000;

// Ad-hoc OTA dağıtımı için doğru değerler. İkisi de kolayca yanlış yazılabiliyor:
//   - `ad-hoc` deprecated, güncel karşılığı `release-testing`
//   - `Apple Distribution` ile `iOS Distribution` AYRI otomatik seçicilerdir;
//     buradaki sertifika eski tipte (`iPhone Distribution: ...`) olduğu için
//     `Apple Distribution` yazılırsa export "eşleşen sertifika yok" der.
// İkisi de `xcodebuild -help` ile doğrulandı (Xcode 26.6), bkz. docs/LOCAL_BUILD.md.
const EXPORT_METHOD = "release-testing";
const SIGNING_CERTIFICATE = "iOS Distribution";

export interface ExportedIpa {
  ipaPath: string;
  manifestPath: string;
  exportDir: string;
}

/**
 * Bu build'in nasıl imzalanacağı.
 *
 * `manual` normal yol ve varsayılan: kurulu ad-hoc profil doğrudan gösteriliyor.
 * Neden otomatik imzalamaya güvenilmediği `archive()` içinde yazılı.
 *
 * `automatic` yalnızca **profil hiç yokken** ve App Store Connect anahtarı
 * tanımlıyken devreye giriyor — tek amacı eksik profili Apple'a ürettirmek.
 * Profil bir kez oluştuktan sonra diske kurulduğu için sonraki build'ler yine
 * `manual` yolu kullanıyor. Yani bu bir kurulum kolaylığı, kalıcı bir mod değil.
 */
export type Signing =
  | { mode: "manual"; profile: InstalledProfile }
  | { mode: "automatic"; teamId: string; credentials: AppStoreConnectCredentials };

export function signingTeamId(signing: Signing): string {
  return signing.mode === "manual" ? signing.profile.teamId : signing.teamId;
}

/**
 * `xcodebuild`in Apple Developer portalıyla konuşmasını sağlayan bayraklar.
 *
 * `man xcodebuild` (Xcode 26.6): `-allowProvisioningUpdates` otomatik imzalanan
 * hedefler için profil, app ID ve sertifika ÜRETİYOR; manuel imzalananlar için
 * eksik profili indiriyor. `-allowProvisioningDeviceRegistration` ise cihazı
 * portala kaydediyor. `-authenticationKey*` üçlüsü Xcode'un Accounts panelinde
 * hesap ekli olmasını gerektirmiyor, yani başsız çalışıyor.
 *
 * Saf fonksiyon: bayrak adları sessizce yanlış yazılabilecek türden.
 */
export function authenticationArgs(credentials: AppStoreConnectCredentials): string[] {
  return [
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    "-authenticationKeyPath", credentials.keyPath,
    "-authenticationKeyID", credentials.keyId,
    "-authenticationKeyIssuerID", credentials.issuerId,
  ];
}

/** Archive adımının imzalama ayarları. Saf fonksiyon. */
export function archiveSigningArgs(signing: Signing, identity: string | undefined): string[] {
  if (signing.mode === "automatic") {
    return [
      `DEVELOPMENT_TEAM=${signing.teamId}`,
      "CODE_SIGN_STYLE=Automatic",
      ...authenticationArgs(signing.credentials),
    ];
  }

  return [
    // Expo prebuild projeye DEVELOPMENT_TEAM yazmıyor. `expo run:ios` bunu
    // fark ettirmiyor çünkü Expo CLI imzalamayı kendi çözüp takımı build
    // anında enjekte ediyor; ham `xcodebuild archive` ise
    // "Signing for ... requires a development team" diyip anında patlıyor.
    `DEVELOPMENT_TEAM=${signing.profile.teamId}`,
    // Otomatik imzalama burada kullanılamaz: makinedeki wildcard development
    // profilini (`TEAMID1234.*`) seçiyor ve o profilde push notification
    // yetkisi olmadığı için "doesn't include the aps-environment entitlement"
    // hatası veriyor. Ad-hoc profili doğrudan gösteriyoruz.
    "CODE_SIGN_STYLE=Manual",
    `PROVISIONING_PROFILE_SPECIFIER=${signing.profile.uuid}`,
    `CODE_SIGN_IDENTITY=${identity ?? ""}`,
  ];
}

export interface XcodeTarget {
  workspacePath: string;
  scheme: string;
}

/**
 * `Release` → JS bundle gömülü, offline açılır, dev mode yok (/qabuild karşılığı).
 * `Debug`   → dev launcher aktif, /preview'a bağlanır, fast refresh var
 *             (/devbuild karşılığı). JS bundle gömülü değildir.
 *
 * İkisi de aynı ad-hoc dağıtım profiliyle imzalanır. Debug build'i dağıtım
 * profiliyle imzalamak sorun değil: dev launcher `EXAppDefines.APP_DEBUG`'a,
 * yani `#if DEBUG` derleme bayrağına bakıyor — profildeki `get-task-allow`
 * entitlement'ına değil. EAS'in ürettiği development build'i de tam olarak
 * böyle imzalıyor (`get-task-allow: False`), doğrulandı.
 */
export type BuildConfiguration = "Release" | "Debug";

/**
 * `ios/<ad>.xcworkspace` dosyasını bulur. Scheme'in workspace ile aynı isimde
 * olması iki proje tipinde de geçerli: Expo prebuild öyle üretiyor
 * (exampleexpoapp.xcworkspace → `exampleexpoapp` scheme'i), RN CLI şablonu da öyle.
 */
export function resolveXcodeTarget(projectPath: string): XcodeTarget {
  const iosDir = path.join(projectPath, "ios");
  if (!fs.existsSync(iosDir)) {
    // Hangi komutun eksik kaldığı proje tipine bağlı, bu katman onu bilmiyor.
    throw new Error(m().signing.noIosFolder);
  }

  const workspace = fs.readdirSync(iosDir).find((entry) => entry.endsWith(".xcworkspace"));
  if (!workspace) {
    throw new Error(m().signing.noWorkspace);
  }

  return {
    workspacePath: path.join(iosDir, workspace),
    scheme: path.basename(workspace, ".xcworkspace"),
  };
}

/**
 * Release archive üretir. JS bundle bu adımda gömülür — çıktı Metro'ya bağımlı
 * olmadan açılır (/qabuild'ın verdiği build ile aynı davranış).
 *
 * Uzun süren adım burasıdır; tunnel'ı bu bittikten sonra açmak, tünelin gereksiz
 * yere 20 dakika açık kalmasını önler.
 */
export async function archive(
  projectPath: string,
  target: XcodeTarget,
  configuration: BuildConfiguration,
  signing: Signing,
  onProgress?: (lastLine?: string) => void
): Promise<string> {
  const archivePath = path.join(projectPath, "build", "app.xcarchive");
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.rmSync(archivePath, { recursive: true, force: true });

  // Otomatik modda kimliği Xcode kendisi seçiyor; sabitlemek bootstrap'ın
  // amacını (henüz var olmayan kimlik bilgilerini ürettirmek) baltalardı.
  const identity = signing.mode === "manual" ? await findDistributionIdentity(signing.profile.teamId) : undefined;

  const build = runProcess(
    "xcodebuild",
    [
      "-workspace", target.workspacePath,
      "-scheme", target.scheme,
      "-configuration", configuration,
      "-destination", "generic/platform=iOS",
      "-archivePath", archivePath,
      // Debug şeması varsayılan olarak ONLY_ACTIVE_ARCH=YES ile gelir; generic
      // iOS hedefine archive alırken "aktif mimari" diye bir şey olmadığı için
      // bu ayar cihazda çalışmayan bir binary üretebiliyor. Release'de zaten NO.
      "ONLY_ACTIVE_ARCH=NO",
      ...archiveSigningArgs(signing, identity),
      "archive",
    ],
    {
      cwd: projectPath,
      timeoutMs: ARCHIVE_TIMEOUT_MS,
      logFilePath: path.join(projectPath, "build", "archive.log"),
      onProgress: (_elapsedMs, lastLine) => onProgress?.(lastLine),
    }
  );

  await build.finished("Archive");
  return archivePath;
}

/**
 * ExportOptions.plist'i yazar ve archive'ı `.ipa`'ya çevirir.
 *
 * `manifest` anahtarı verildiğinde Xcode `manifest.plist`'i de kendisi üretir —
 * elle yazmaya gerek yok. Ama URL'leri içine SABİT gömdüğü için host'un burada,
 * yani tunnel açıldıktan sonra bilinmesi gerekiyor.
 */
export async function exportArchive(
  projectPath: string,
  archivePath: string,
  baseUrl: string,
  bundleId: string,
  signing: Signing
): Promise<ExportedIpa> {
  const exportDir = path.join(projectPath, "build", "ipa");
  fs.rmSync(exportDir, { recursive: true, force: true });

  const optionsPath = path.join(projectPath, "build", "ExportOptions.plist");
  fs.writeFileSync(optionsPath, buildExportOptionsPlist(baseUrl, bundleId, signing));

  const exportRun = runProcess(
    "xcodebuild",
    [
      "-exportArchive",
      "-archivePath", archivePath,
      "-exportPath", exportDir,
      "-exportOptionsPlist", optionsPath,
      // Ad-hoc DAĞITIM profili tam olarak burada doğuyor: archive geliştirme
      // imzasıyla alınabiliyor, ama `release-testing` export'u dağıtım profili
      // istiyor ve yoksa Xcode bu bayrakla onu üretiyor.
      ...(signing.mode === "automatic" ? authenticationArgs(signing.credentials) : []),
    ],
    {
      cwd: projectPath,
      timeoutMs: EXPORT_TIMEOUT_MS,
      logFilePath: path.join(projectPath, "build", "export.log"),
    }
  );

  await exportRun.finished("Export");

  const ipaName = fs.readdirSync(exportDir).find((entry) => entry.endsWith(".ipa"));
  if (!ipaName) {
    throw new Error(m().signing.noIpaProduced(fs.readdirSync(exportDir).join(", ")));
  }

  const manifestPath = path.join(exportDir, "manifest.plist");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(m().signing.noManifest);
  }

  return { ipaPath: path.join(exportDir, ipaName), manifestPath, exportDir };
}

export interface InstalledProfile {
  uuid: string;
  name: string;
  teamId: string;
  /** Profilin son geçerlilik tarihi; seçim ve süresi dolmuşları eleme için. */
  expiresAt?: Date;
}

/**
 * Aynı bundle id için birden fazla ad-hoc profil kurulu olabiliyor ve bu istisna
 * değil: profil portaldan her indirildiğinde ya da `-allowProvisioningUpdates`
 * bir tane ürettiğinde yenisi ekleniyor (2026-08-12'de example-rn-app'de tam olarak
 * bu oldu — elle üretilmiş "example ad hoc profile" ile Xcode'un ürettiği "iOS Team Ad
 * Hoc Provisioning Profile" yan yana kaldı).
 *
 * Eskiden listedeki İLK aday alınıyordu; dizin sırası keyfi olduğu için bu,
 * süresi dolmuş bir profille imzalamak demek olabilirdi. Kural: süresi
 * dolmuşlar elenir, kalanlardan son kullanma tarihi en ileri olan seçilir —
 * yani en taze kimlik bilgisi.
 *
 * Saf fonksiyon: seçim sessizce yanlış olabilecek ve ancak telefonda
 * "uygulama kurulamadı" olarak görünecek türden.
 */
export function selectProfile(candidates: InstalledProfile[], now: Date): InstalledProfile | undefined {
  const usable = candidates.filter((profile) => !profile.expiresAt || profile.expiresAt > now);
  return [...usable].sort(
    (a, b) => (b.expiresAt?.getTime() ?? Infinity) - (a.expiresAt?.getTime() ?? Infinity)
  )[0];
}

/**
 * Keychain'deki dağıtım sertifikasının SHA-1 parmak izini bulur.
 *
 * `CODE_SIGN_IDENTITY`'ye isim yerine parmak izi vermek daha güvenli: makinede
 * hem `Apple Development` hem `iPhone Distribution` kimliği var ve isim eşleşmesi
 * önek bazlı çalıştığı için sertifika tipi ileride değişirse sessizce yanlış
 * kimliği seçebilir.
 */
export async function findDistributionIdentity(teamId: string): Promise<string> {
  const { stdout } = await execa("security", ["find-identity", "-v", "-p", "codesigning"], { reject: false });

  for (const line of stdout.split("\n")) {
    const match = /^\s*\d+\)\s+([0-9A-F]{40})\s+"(.+)"\s*$/.exec(line);
    if (!match) continue;
    const [, sha1, name] = match;
    if (!sha1 || !name) continue;
    if (name.includes("Distribution") && name.includes(`(${teamId})`)) return sha1;
  }

  throw new Error(m().signing.noCertificate(teamId));
}

/** Çözülmüş profil plist'inden tek bir anahtarı okur. */
async function extractKey(plist: Uint8Array, key: string, format: "raw" | "json"): Promise<string | undefined> {
  const { stdout, exitCode } = await execa("plutil", ["-extract", key, format, "-o", "-", "-"], {
    input: plist,
    reject: false,
  });
  return exitCode === 0 ? stdout.trim() : undefined;
}

/**
 * Kurulu provisioning profilleri tarayıp bu bundle id'ye ait ad-hoc/dağıtım
 * profilini bulur (`get-task-allow: false` olanı).
 *
 * Profili açıkça belirtmek şart: makinede aynı uygulamayı kapsayan bir
 * development wildcard profili de kurulu (`TEAMID1234.*`), ve otomatik seçim
 * bırakılırsa Xcode'un hangisini alacağı garanti değil. Yanlışını alırsa
 * `.ipa` OTA ile kurulamaz.
 */
export async function findAdHocProfile(bundleId: string): Promise<InstalledProfile> {
  // os.homedir() tercih ediliyor: process.env.HOME boşsa buradan göreli bir yol
  // çıkıyor ve arama sessizce yanlış dizinde yapılıyordu.
  const dir = path.join(os.homedir(), "Library/Developer/Xcode/UserData/Provisioning Profiles");
  if (!fs.existsSync(dir)) {
    throw new Error(m().signing.noProfileDirectory);
  }

  const candidates: InstalledProfile[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith(".mobileprovision")) continue;

    const { stdout: xml, exitCode } = await execa("security", ["cms", "-D", "-i", path.join(dir, entry)], {
      reject: false,
      encoding: "buffer",
    });
    if (exitCode !== 0) continue;

    // Profilin tamamını JSON'a çeviremiyoruz: `DeveloperCertificates` ikili veri
    // içeriyor ve `plutil -convert json` bu yüzden tüm dosyada hata veriyor.
    // Anahtarları tek tek çekmek bu sorunu tamamen atlıyor.
    const uuid = await extractKey(xml, "UUID", "raw");
    const name = await extractKey(xml, "Name", "raw");
    const entitlementsJson = await extractKey(xml, "Entitlements", "json");
    const expiresRaw = await extractKey(xml, "ExpirationDate", "raw");
    if (!uuid || !name || !entitlementsJson) continue;

    const expiresAt = expiresRaw ? new Date(expiresRaw) : undefined;

    let entitlements: Record<string, unknown>;
    try {
      entitlements = JSON.parse(entitlementsJson);
    } catch {
      continue;
    }

    const appId = entitlements["application-identifier"];
    const teamId = entitlements["com.apple.developer.team-identifier"];
    const isDistribution = entitlements["get-task-allow"] === false;
    if (!isDistribution || typeof appId !== "string" || typeof teamId !== "string") continue;
    // application-identifier "<TEAM>.<bundleId>" biçiminde
    if (!appId.endsWith(`.${bundleId}`)) continue;

    candidates.push({
      uuid,
      name,
      teamId,
      expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : undefined,
    });
  }

  const profile = selectProfile(candidates, new Date());
  if (!profile && candidates.length > 0) {
    // Aday vardı ama hepsi süresi dolmuş: "profil yok" demek yanıltıcı olurdu,
    // kullanıcı onları diskte görüyor.
    throw new Error(m().signing.allProfilesExpired(bundleId, candidates.map((c) => c.name).join(", ")));
  }
  if (!profile) {
    throw new Error(m().signing.noProfile(bundleId));
  }
  return profile;
}

/**
 * Keychain'deki dağıtım sertifikalarının ait olduğu takım kimlikleri.
 *
 * Otomatik bootstrap'te takımı bilmek şart (`DEVELOPMENT_TEAM`) ve profil
 * olmadığı için onu profilden okuyamıyoruz. Sertifika takım genelinde ve tek
 * sefer kurulduğu için doğru kaynak bu.
 */
export async function findDistributionTeamIds(): Promise<string[]> {
  const { stdout } = await execa("security", ["find-identity", "-v", "-p", "codesigning"], { reject: false });

  const teamIds = new Set<string>();
  for (const line of stdout.split("\n")) {
    const name = /^\s*\d+\)\s+[0-9A-F]{40}\s+"(.+)"\s*$/.exec(line)?.[1];
    if (!name || !name.includes("Distribution")) continue;
    const teamId = /\(([A-Z0-9]{10})\)\s*$/.exec(name)?.[1];
    if (teamId) teamIds.add(teamId);
  }
  return [...teamIds];
}

/**
 * Bu build'in nasıl imzalanacağına karar verir.
 *
 * Sıra bilinçli: kurulu ad-hoc profil varsa HER ZAMAN o kullanılıyor. Otomatik
 * mod yalnızca profil hiç yokken ve App Store Connect anahtarı tanımlıyken
 * devreye giriyor, tek amacı eksik profili ürettirmek. Böylece çalışan
 * kurulumların davranışı hiç değişmiyor.
 */
export async function resolveSigning(bundleId: string): Promise<Signing> {
  try {
    return { mode: "manual", profile: await findAdHocProfile(bundleId) };
  } catch (missingProfile) {
    const credentials = config.appStoreConnect;
    if (!credentials) throw missingProfile;

    if (!fs.existsSync(credentials.keyPath)) {
      throw new Error(m().signing.ascKeyMissing(credentials.keyPath));
    }

    const teamIds = await findDistributionTeamIds();
    const teamId = teamIds[0];
    if (!teamId) {
      // Sertifika olmadan ne otomatik ne manuel imzalama mümkün; anahtar da
      // bunu çözmüyor, çünkü dağıtım sertifikası keychain'de olmak zorunda.
      throw missingProfile;
    }
    if (teamIds.length > 1) {
      throw new Error(m().signing.multipleTeams(teamIds.join(", ")));
    }

    return { mode: "automatic", teamId, credentials };
  }
}

export function buildExportOptionsPlist(baseUrl: string, bundleId: string, signing: Signing): string {
  // Otomatik modda profil ve sertifika seçimini Xcode yapıyor: ikisi de henüz
  // var olmayabilir, zaten bu modun sebebi onları ürettirmek.
  const signingBlock =
    signing.mode === "manual"
      ? `  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>${SIGNING_CERTIFICATE}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${bundleId}</key>
    <string>${signing.profile.name}</string>
  </dict>`
      : `  <key>signingStyle</key>
  <string>automatic</string>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${EXPORT_METHOD}</string>
  <key>teamID</key>
  <string>${signingTeamId(signing)}</string>
${signingBlock}
  <key>stripSwiftSymbols</key>
  <true/>
  <key>manifest</key>
  <dict>
    <key>appURL</key>
    <string>${baseUrl}/app.ipa</string>
    <key>displayImageURL</key>
    <string>${baseUrl}/icon-57.png</string>
    <key>fullSizeImageURL</key>
    <string>${baseUrl}/icon-512.png</string>
  </dict>
</dict>
</plist>
`;
}
