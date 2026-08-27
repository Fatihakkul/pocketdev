import type { Messages } from "./en.js";

/**
 * Türkçe sözlük. Metinler kodda zaten yazılmış hallerinden alındı — özellikle
 * kurulum hatalarındaki yönlendirmeler pahalıya öğrenilmiş şeyler, yeniden
 * yazılmadı.
 *
 * `Messages` tipi sayesinde eksik ya da fazla anahtar derleme hatası veriyor.
 */
export const tr: Messages = {
  auth: {
    claimed:
      "✅ Sahiplik doğrulandı. Bot artık yalnızca sana yanıt verecek.\n\nBaşlamak için /help yazabilirsin.",
    wrongCode: "Kod hatalı. Botu çalıştırdığın makinenin konsoluna basılan kodu kullan.",
    unclaimedConsole: (code: string): string =>
      "\n" +
      "  Bot henüz sahiplenilmedi.\n" +
      `  Telegram'dan bota şunu yaz:  /claim ${code}\n` +
      "  (kod her yeniden başlatmada değişir)\n",
  },

  help: {
    heading: "Komutlar:",
    footer:
      "\nDüz metin yazarsan: aktif proje varsa o klasörde, yoksa genel bir \"scratch\" alanında " +
      "Claude Code'a iletilir (planlama/roadmap sohbetleri için proje seçmene gerek yok). " +
      "Not: önce /newchat ile kilidi açmadan hiçbir mesaj Claude'a gitmez.\n\n" +
      "Plan kaydetme/listeleme/yükleme için komut yok — düz metinle iste: " +
      "\"bunu plan olarak kaydet\", \"planları listele\", \"şu planı yükle\" gibi. " +
      "Claude bunu kendi başına workspace/plans/ altında yönetir.",
  },

  doctor: {
    checking: "⏳ Kurulum kontrol ediliyor…",
    failed: (reason: string): string => `Kontrol tamamlanamadı:\n${reason}`,
    scope: "Kurulum kontrolü",
    scopeWithProject: (project: string): string => `Kurulum kontrolü (proje: ${project})`,
    allGood: "Her şey hazır.",
    countMissing: (n: number): string => `${n} eksik`,
    countWarnings: (n: number): string => `${n} uyarı`,

    xcode: "Xcode",
    xcodeFix: "App Store'dan Xcode kur, sonra: sudo xcode-select --switch /Applications/Xcode.app",
    claudeCode: "Claude Code",
    claudeCodeFix: "https://claude.com/claude-code — kurulum sonrası `claude` ile giriş yap.",
    cocoapods: "CocoaPods",
    cocoapodsFix: "React Native CLI projeleri için gerekiyor (Expo'da değil): brew install cocoapods",
    installed: "kurulu",
    notFound: "bulunamadı",

    certificate: "Dağıtım sertifikası",
    certificateMissing: "keychain'de yok",
    certificateFix:
      "`/otabuild` için gerekli (`/localbuild` ve `/preview` için değil).\n" +
      "Apple Developer portalı → Certificates → Apple Distribution, indirip çift tıkla.",

    tunnel: "Tunnel (Tailscale Funnel)",
    tunnelReady: "hazır",
    tunnelUnavailable: "kullanılamıyor",

    project: "Proje",
    projectUnreadable: "okunamadı",
    profile: "Ad-hoc profil",
    profileMissing: "yok — yalnızca /otabuild etkilenir",
  },

  tunnel: {
    notLoggedIn: (state: string): string =>
      `Tailscale oturumu açık değil (durum: ${state}).\n  tailscale up`,
    noMachineName: "Tailscale makine adı alınamadı (MagicDNS kapalı olabilir).",
    httpsDisabled:
      "Tailnet'te HTTPS sertifikaları kapalı; Funnel bunlar olmadan TLS kuramıyor.\n" +
      "  Admin konsolu → DNS → HTTPS Certificates → Enable",
    funnelNotAllowed:
      "Bu makineye Funnel izni verilmemiş.\n" +
      "  Admin konsolu → Access Controls → nodeAttrs içine `funnel` özniteliğini ekle",
    daemonUnreachable:
      "Tailscale servisine bağlanılamadı. Kurulum:\n" +
      "  sudo brew services start tailscale\n" +
      "  tailscale up",
    statusUnreadable: "tailscale status çıktısı okunamadı.",
    cloudflaredMissing: "cloudflared bulunamadı (OTA_TUNNEL=cloudflared).\n  brew install cloudflared",
    unreachable: (target: string, detail: string): string =>
      `Adres açıldı ama erişilebilir olmadı: ${target} (${detail})`,
    noConnection: "bağlantı kurulamadı",
    lastStatus: (status: number): string => `son yanıt: HTTP ${status}`,
    enableVia: (reason: string, link: string): string =>
      `${reason}\n\nAçmak için bu linki ziyaret et:\n${link}`,
    certPending: (health: string, logHint: string): string =>
      `${health}\n\n` +
      "TLS sertifikası hâlâ alınıyor; bu tamamlanmadan HTTPS bağlantısı kurulmuyor. " +
      "İlk sertifika dakikalar sürebilir. Doğrulama üst üste başarısız olduysa Let's Encrypt " +
      "saatlik kota uygular (identifier başına 5 başarısız doğrulama) — o durumda beklemek gerekir.\n" +
      `Ayrıntı: ${logHint}`,
    genericFailure: (message: string, logPath: string, logHint: string): string =>
      `${message}\n\n` +
      "Funnel açılmadıysa büyük ihtimalle tailnet ayarları eksik:\n" +
      "• Admin konsolunda HTTPS sertifikaları açık olmalı\n" +
      "• Funnel, ACL'de bu makineye izinli olmalı\n" +
      `• Log: ${logPath}\n` +
      `• tailscaled logu: ${logHint}`,
    logHintFallback: "tailscaled logu (Homebrew kurulumlarında var/log/tailscaled.log)",
  },

  commands: {
    help: "Komut listesini göster",
    new: "Yeni proje oluştur",
    newUsage: "<isim> [template]",
    templates: "Mevcut şablonları listele",
    projects: "Projeleri listele",
    use: "Aktif projeyi değiştir",
    useUsage: "<isim>",
    newchat: "Proje seçimini ve Claude oturumunu sıfırla, kilidi aç",
    endchat: "Claude oturumunu sonlandır ve kilidi kapat",
    preview: "Dev server + tunnel başlat",
    stop: "Çalışan önizlemeyi durdur",
    record: "iOS simülatörde kısa video kaydı al",
    qabuild: "EAS'te QA build al (Release)",
    devbuild: "EAS'te development build al (Debug)",
    localbuild: "Yerelde Debug build alıp bağlı cihaza kur (EAS kredisi harcamaz)",
    localbuildUsage: "[cihaz]",
    otabuild: "Yerelde .ipa üretip kurulum linki ver (kablosuz, kredisiz)",
    otabuildUsage: "[dev]",
    otalink: "Açık OTA kurulum linkini tekrar gönder",
    otastop: "OTA linkini kapat",
    pwd: "Aktif proje klasörünü göster",
    ls: "Dosyaları listele",
    lsUsage: "[yol]",
    mkdir: "Klasör oluştur",
    mkdirUsage: "<isim>",
    diff: "git diff göster",
    diffUsage: "[yol]",
    model: "Modeli göster/değiştir",
    modelUsage: "[isim]",
    usage: "Token/maliyet kullanımını göster",
    doctor: "Kurulumu kontrol et (Xcode, sertifika, tünel, profil)",
  },

  project: {
    noneActive: "Aktif proje yok. Önce /new veya /use ile bir proje seç.",
    newUsage: "Kullanım: /new <isim> [template]",
    invalidName: "Proje ismi sadece harf, rakam, - ve _ içerebilir.",
    alreadyExists: (name: string): string => `"${name}" zaten var. /use ${name} ile aktif edebilirsin.`,
    templateNotFound: (template: string): string =>
      `Template "${template}" bulunamadı. /templates ile listeye bak.`,
    templateAmbiguous: "Birden fazla template mevcut, hangisini kullanmak istediğini belirt: /templates",
    creating: (name: string, template: string): string => `⏳ "${name}" oluşturuluyor (${template})...`,
    createFailed: (reason: string): string => `Proje oluşturulamadı: ${reason}`,
    useUsage: "Kullanım: /use <isim>",
    notFound: (name: string): string => `"${name}" bulunamadı. /projects ile mevcut projelere bak.`,
    switched: (name: string): string => `✅ Aktif proje: ${name}`,
    none: "Henüz proje yok. /new <isim> ile oluştur.",
    activeSuffix: "aktif",
  },

  fs: {
    empty: "(boş)",
    outsideProject: "Bu yola erişilemez.",
    error: (reason: string): string => `Hata: ${reason}`,
    mkdirUsage: "Kullanım: /mkdir <isim>",
    created: (relativePath: string): string => `✅ Oluşturuldu: ${relativePath}`,
    noChanges: "Değişiklik yok.",
    diffFailed: (reason: string): string => `git diff çalıştırılamadı (bu bir git deposu mu?): ${reason}`,
  },

  chat: {
    locked: "🔒 Önce /newchat gönder, sonra konuşabiliriz.",
    sandboxVerifying: "⏳ Sandbox doğrulaması sürüyor, birkaç saniye sonra tekrar dene.",
    sandboxFailed: (detail: string): string =>
      `🚫 Sandbox doğrulanamadı, Claude oturumu açılmıyor.\n${detail}`,
    busy: "Önceki istek hâlâ işleniyor, lütfen bekleyin.",
    working: "⏳ Claude çalışıyor...",
    started:
      "✅ Yeni bir sohbet başlatıldı (proje seçili değil). Serbestçe planlama yapabilirsin; " +
      "hazır olduğunda /new ile bunu bir projeye dönüştürebilirsin.\n\n" +
      "🔓 Kilit açıldı, /endchat çağırana kadar konuşabilirsin.",
    ended:
      "✅ Claude oturumu sonlandırıldı (proje seçimi değişmedi).\n\n" +
      "🔒 Kilit kapandı, tekrar konuşmak için önce /newchat göndermen gerekiyor.",
  },

  ota: {
    alreadyBuilding: "Zaten bir OTA build sürüyor, lütfen bekle.",
    usage: "Kullanım: /otabuild (Release, offline çalışır) veya /otabuild dev (Debug, fast refresh'li).",
    started: (configuration: string): string =>
      `⏳ OTA build başlatıldı (${configuration} archive → .ipa → tunnel).\n` +
      "İlk archive 10-20 dk sürer. EAS kredisi harcanmıyor.",
    progress: (stage: string, elapsed: string): string => `⏳ ${stage} (${elapsed})`,
    ready: (elapsed: string, url: string): string => `✅ Kurulum hazır (${elapsed}):\n${url}`,
    resynced:
      "🔧 Bağımlılıklar değişmişti, native proje yeniden eşitlendi — bu build'i kurmadan eski " +
      "uygulamada eksik native modül hatası devam eder.\n",
    openInSafari:
      "📱 Linki **Safari'de** aç ve \"Uygulamayı Yükle\"ye bas. Telegram'ın kendi tarayıcısı " +
      "kurulum linklerini açamıyor — gerekirse sağ üstten \"Safari'de Aç\" de.",
    debugNote:
      "⚠️ Bu bir Debug build — tek başına açılmaz. Kurduktan sonra /preview ile dev sunucuyu " +
      "başlat, dönen linke basınca uygulamaya girer ve fast refresh çalışır.",
    releaseNote: "✔️ Bu build offline çalışır, /preview gerekmez (dev mode ve fast refresh de yok).",
    overwriteWarning: "⚠️ Aynı bundle id'yi kullandığı için telefondaki diğer build'in üzerine kurulur.",
    expiryWarning: (minutes: number): string =>
      `⚠️ Link ${minutes} dakika sonra veya /otastop ile kapanır; Mac uyursa da çalışmaz.`,
    failed: (reason: string): string => `OTA build başarısız oldu:\n${reason}`,
    stopped: "OTA linki kapatıldı.",
    noLink: "Açık bir OTA linki yok.",
    linkIs: (url: string): string => `Kurulum linki:\n${url}`,
    noLinkHint: "Açık bir OTA linki yok. /otabuild ile yeni bir tane al.",
  },

  preview: {
    alreadyRunning: "Zaten çalışan bir önizleme var. Önce /stop ile durdur.",
    starting: "⏳ Dev server + tunnel başlatılıyor (ilk seferde birkaç dakika sürebilir)...",
    doNotTapMulti:
      "📱 **Aşağıdaki adreslere DOKUNMA** — kopyala. Dokunursan tarayıcıda web sürümü açılır (dev mode olmaz).",
    doNotTapSingle:
      "📱 **Aşağıdaki adrese DOKUNMA** — kopyala. Dokunursan tarayıcıda web sürümü açılır (dev mode olmaz).",
    waySafari: "**Yol 1 — Safari (en hızlı):**",
    waySafariHint: "Şu linki kopyala, Safari'nin adres çubuğuna yapıştırıp Git'e bas:",
    wayInApp: "**Yol 2 — Uygulama içinden:**",
    wayInAppHint: (clientName: string): string =>
      `${clientName} aç, cihazı salla (veya üç parmakla dokun) → dev menü → "Enter URL manually" → şu adresi yapıştır:`,
    stopHint: "Bitirince /stop.",
    qrCaption: "Başka bir cihazdan taramak istersen bu QR'ı kullan.",
    failed: (reason: string): string => `Önizleme başlatılamadı:\n${reason}`,
    stopped: "🛑 Önizleme durduruldu.",
    notRunning: "Çalışan bir önizleme yok.",
  },

  build: {
    localAlreadyRunning: "Zaten bir yerel build sürüyor, lütfen bekle.",
    localStarted: (device: string, osVersion: string): string =>
      `⏳ Yerel Debug build başlatıldı → ${device} (${osVersion}).\n` +
      "İlk build 10-20 dk sürer, sonrakiler artımlı olduğu için çok daha hızlı. EAS kredisi harcanmıyor.",
    localProgress: (device: string, elapsed: string): string =>
      `⏳ Yerel Debug build sürüyor → ${device} (${elapsed})`,
    localInstalled: (device: string): string => `${device} cihazına kuruldu`,
    localReady: (device: string, elapsed: string): string =>
      `✅ Yerel build hazır ve ${device} cihazına kuruldu (${elapsed}).\n\n` +
      "⚠️ Bu bir Debug build — tek başına açılmaz. Kullanmadan önce /preview ile dev sunucuyu başlat.\n" +
      "⚠️ Aynı bundle id'yi kullandığı için telefondaki QA build'inin üzerine kurulur.",
    localFailed: (reason: string): string => `Yerel build başarısız oldu:\n${reason}`,

    qaAlreadyRunning: "Zaten bir QA build sürüyor, lütfen bekle.",
    qaStarted:
      "⏳ EAS'te iOS build başlatıldı (QA testi için). Bu genelde 10-20 dakika sürüyor, bitince haber vereceğim...",
    qaReady: (pageUrl: string, downloadUrl: string): string =>
      `✅ Build hazır! Kayıtlı cihazından şu linki açıp kurabilirsin:\n${pageUrl}` +
      (downloadUrl ? `\n\nDoğrudan .ipa: ${downloadUrl}` : ""),
    qaFailed: (reason: string): string => `QA build başarısız oldu:\n${reason}`,

    devAlreadyRunning: "Zaten bir build sürüyor, lütfen bekle.",
    devStarted:
      "⏳ EAS'te development build başlatıldı (Debug, fast refresh'li). 10-20 dakika sürüyor, bitince haber vereceğim...",
    devReady: (pageUrl: string, downloadUrl: string): string =>
      `✅ Development build hazır! Kayıtlı cihazından şu linki açıp kurabilirsin:\n${pageUrl}` +
      (downloadUrl ? `\n\nDoğrudan .ipa: ${downloadUrl}` : "") +
      "\n\n⚠️ Bu build tek başına çalışmaz — açmadan önce /preview ile dev sunucuyu başlat." +
      "\n⚠️ Aynı bundle id'yi kullandığı için telefondaki QA build'inin üzerine kurulur.",
    devFailed: (reason: string): string => `Development build başarısız oldu:\n${reason}`,

    minutes: (n: number): string => `${n} dk`,
  },

  record: {
    alreadyRunning: "Zaten bir video kaydı sürüyor, lütfen bekle.",
    caption: (project: string): string => `🎥 "${project}" — güncel durum (iOS Simülatör)`,
    failed: (reason: string): string => `Video kaydedilemedi:\n${reason}`,
  },

  model: {
    forced: (name: string): string => `Zorla ayarlanmış model: ${name}`,
    notForcedWithLast: (last: string): string =>
      `Model zorla ayarlanmadı (hesap varsayılanı kullanılıyor). Son mesajda kullanılan model: ${last}`,
    notForced:
      "Model zorla ayarlanmadı (hesap varsayılanı kullanılıyor). Henüz mesaj gönderilmediği için gerçek model bilinmiyor.",
    set: (name: string): string => `✅ Model ayarlandı: ${name}`,
  },

  usage: {
    none: "Henüz kayıtlı kullanım yok. Claude'a bir mesaj gönderdikten sonra tekrar /usage dene.",
    inputTokens: "Input tokens",
    outputTokens: "Output tokens",
    cacheWrite: "Cache write",
    cacheRead: "Cache read",
    totalCost: "Toplam maliyet",
    total: "Toplam kullanım:",
    forProject: (project: string): string => `"${project}" projesi:`,
  },

  runtime: {
    requestInFlight: "Bir istek zaten işleniyor, lütfen bekleyin.",
    folderPickerTimedOut: "Klasör seçme diyaloğu zaman aşımına uğradı.",
    noBundleIdentifier:
      "Expo yapılandırmasında expo.ios.bundleIdentifier ayarlı değil, imzalama profili seçilemez.",
    noBundleIdentifierForLink:
      "Expo yapılandırmasında expo.ios.bundleIdentifier bulunamadı, development build linki oluşturulamadı.",
    noBundleIdentifierBeforeBuild:
      "Expo yapılandırmasında expo.ios.bundleIdentifier ayarlı değil, önce bunu ayarlamamız lazım.",
    expoConfigMissing:
      "Expo yapılandırması bulunamadı (app.json, app.config.json ya da app.config.js/ts).",
    expoConfigNeedsInstall:
      "Bu proje dinamik Expo yapılandırması (app.config.js/ts) kullanıyor ama değerlendirilemedi. Proje-yerel expo CLI'nin çözümleyebilmesi için önce `npm install` çalıştır.",
    expoConfigUnreadable: "`expo config --json` JSON döndürmedi.",
    metroExited: "Metro beklenmedik şekilde sonlandı.",
    previewAlreadyRunning: "Zaten çalışan bir önizleme var. Önce /stop ile durdur.",
    tunnelUrlTimeout: "Tunnel URL alınamadı (zaman aşımı).",
    expoCliMissing: "expo CLI bulunamadı. Bağımlılıkların kurulu olduğundan emin ol (npm install).",
    noSimulator: "Uygun bir iOS simülatörü bulunamadı.",
    buildSettingsUnreadable: "xcodebuild ayarları okunamadı (beklenen JSON gelmedi).",
    noXcodeProject: "ios/ altında .xcworkspace ya da .xcodeproj bulunamadı.",
    buildTimedOut: "Build zaman aşımına uğradı.",
    buildNotStarted: "Build başlatılamadı (boş yanıt).",
    noMatchingDevice: (search: string, list: string): string =>
      `"${search}" ile eşleşen cihaz yok. Bağlı cihazlar:\n${list}`,
  },

  signing: {
    noIosFolder: "ios/ klasörü yok — native proje henüz üretilmemiş.",
    noWorkspace: "ios/ altında .xcworkspace bulunamadı. Pods kurulu mu? (`pod install`)",
    noIpaProduced: (contents: string): string =>
      `Export bitti ama .ipa üretilmedi. Klasör içeriği: ${contents || "(boş)"}`,
    noManifest:
      "manifest.plist üretilmedi — ExportOptions.plist'teki `manifest` anahtarı işlenmemiş olabilir.",
    noCertificate: (teamId: string): string =>
      `Keychain'de ${teamId} takımına ait bir dağıtım sertifikası yok.\n` +
      "Apple Developer portalından üret (Certificates → Apple Distribution) ve indirilen dosyaya çift tıkla.",
    noProfileDirectory: "Provisioning profile klasörü yok. Ad-hoc profil kurulu mu?",
    allProfilesExpired: (bundleId: string, names: string): string =>
      `${bundleId} için kurulu ad-hoc profillerin hepsinin süresi dolmuş (${names}).\n` +
      "Apple Developer portalından yenile ya da ASC_KEY_ID tanımlıysa yeniden üretilmesini bekle.",
    noProfile: (bundleId: string): string =>
      `${bundleId} için kurulu bir ad-hoc DAĞITIM profili bulunamadı.\n\n` +
      "Xcode'un kendi ürettiği geliştirme profili yetmez: OTA kurulumu " +
      "`get-task-allow=false` olan bir dağıtım profili istiyor.\n\n" +
      "Nereden alınır:\n" +
      "• Apple Developer portalı → Profiles → + → Distribution → Ad Hoc\n" +
      "• Ya da ASC_KEY_ID / ASC_ISSUER_ID tanımla, senin yerine üretilsin (bkz. README)\n\n" +
      "İndirilen dosya ~/Library/Developer/Xcode/UserData/Provisioning Profiles/ altına kopyalanmalı.",
    ascKeyMissing: (keyPath: string): string =>
      `App Store Connect anahtarı bulunamadı: ${keyPath}\n` +
      "ASC_KEY_PATH ile yolu verebilir ya da dosyayı bu konuma koyabilirsin.",
    multipleTeams: (teamIds: string): string =>
      `Keychain'de birden fazla takımın dağıtım sertifikası var (${teamIds}). ` +
      "Hangisinin kullanılacağı belirsiz; kullanılmayan sertifikayı kaldır.",
  },
};
