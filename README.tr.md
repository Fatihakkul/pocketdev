# pocketdev

[![CI](https://github.com/Fatihakkul/pocketdev/actions/workflows/ci.yml/badge.svg)](https://github.com/Fatihakkul/pocketdev/actions/workflows/ci.yml)

*[English README](README.md)*

**Telefondan geliştirme.** Claude Code Mac'inde kod yazar; sen sonucu telefonunda
**canlı** görür ve sürecin tamamını Telegram'dan yönetirsin — uygulamayı derleyip
cihazına kurmak dahil.

Asıl ilginç olan ikinci yarısı. Bir yapay zekâyla uzaktan sohbet etmek çözülmüş
bir problem. **Uygulamanın imzalı ve gerçek bir sürümünü**, internet üzerinden,
canlı yenilemeyle, fiziksel iPhone'una kurmak — hem de EAS Build, TestFlight,
ngrok ya da VPS'e para vermeden — bu projenin gerçekten yaptığı şey bu.

| İş | Normalde maliyeti | Burada |
|---|---|---|
| iOS build | EAS Build kredisi | yerel `xcodebuild` (`/localbuild`, `/otabuild`) |
| Test cihazına kurulum | TestFlight / EAS Submit | yerel `.ipa` + Tailscale Funnel (`/otabuild`) |
| Tünel / hosting | ngrok Pro, VPS | Tailscale Funnel, ücretsiz (yedek: cloudflared) |
| İşi sürmek | — | Telegram ve yerel web paneli üzerinden Claude Code |

**Expo** ve **React Native CLI** projeleriyle çalışır.

> **Durum:** yazarı tarafından günlük kullanılıyor ve gerçek cihazlarda uçtan uca
> doğrulandı, ama genç bir proje. Pürüzler olacak. Yalnızca macOS + iOS —
> [Kapsam](#kapsam) bölümüne bak.

---

## Gereksinimler

- **macOS**, **Xcode** ve command line tools
- **Node.js 20+**
- **[Claude Code](https://claude.com/claude-code)**, kurulu ve giriş yapılmış
- **[Tailscale](https://tailscale.com/)** — ücretsiz plan yeterli
- **CocoaPods** — yalnızca React Native CLI projeleri için
- **Ücretli Apple Developer hesabı** (99$/yıl) — yalnızca `/otabuild` için.
  `/localbuild`, `/preview` ve `/record` hesapsız çalışır.

## Kurulum

```bash
git clone https://github.com/Fatihakkul/pocketdev.git
cd pocketdev
npm install
cp .env.example .env
```

**1. Telegram botu oluştur.** [@BotFather](https://t.me/BotFather)'a `/newbot`
yaz, verdiği token'ı `.env`'e koy:

```
BOT_TOKEN=123456:ABC-DEF...
```

**2. Başlat.**

```bash
npm run dev
```

(Bu şimdilik izleme kipi. Kalıcı olarak ayakta tutmak istediğinde
[Sürekli çalışır halde tutmak](#sürekli-çalışır-halde-tutmak) bölümüne bak.)

Konsola tek seferlik bir sahiplenme kodu basılır:

```
Bot henüz sahiplenilmedi.
Telegram'dan bota şunu yaz:  /claim 481902
```

**3. Sahiplen.** Telegram'dan bota `/claim <kod>` yaz. O kullanıcı artık sahibi
ve bot başka kimseye cevap vermez. Kendi sayısal Telegram id'ni öğrenmen
gerekmiyor.

Bot varsayılan olarak İngilizce konuşuyor. Türkçe için `.env`'e `LOCALE=tr` yaz.

**4. Tailscale'i kur** — önizlemeler ve kurulum linkleri HTTPS üzerinden
buradan servis ediliyor:

```bash
tailscale up
```

Sonra [Tailscale yönetim konsolunda](https://login.tailscale.com/admin):
- **DNS → HTTPS Certificates → Enable**
- **Access Controls** — `nodeAttrs` ile bu makineye `funnel` izni ver

**5. Kurulumu kontrol et.** Bota `/doctor` yaz. Xcode'u, Claude Code'u,
CocoaPods'u, imzalama sertifikanı, tüneli ve proje seçiliyse uygulama kimliğini
ve provisioning profilini denetler; eksik olanı ve çözümünü söyler.

## Sürekli çalışır halde tutmak

`npm run dev` izleme kipi: her dosya değişikliğinde yeniden başlar ve
terminalini kapatınca ölür. pocketdev'in kendi üzerinde çalışırken istediğin şey
bu — ama projenin bütün amacı Mac'in başında *değilken* ona ulaşabilmek, o yüzden
bir süreç yöneticisiyle çalıştır:

```bash
npm run deploy
```

Bu komut botu derler, web panelini build eder ve ikisini `ecosystem.config.cjs`
üzerinden [pm2](https://pm2.keymetrics.io/) ile başlatır (ya da yeniden
başlatır): `pocketdev` adında tek bir süreç, paneli de dahil,
`127.0.0.1:4300`'de.

```bash
npx pm2 logs pocketdev      # logları izle
npx pm2 restart pocketdev   # .env değişikliğini uygula
npx pm2 status
npx pm2 stop pocketdev
```

`.env`'i düzenlemek — elle ya da panelden — yalnızca dosyayı yeniden yazıyor.
Hiçbir şey onu yeniden yüklemiyor, yani değişikliğin geçerli olması için yeniden
başlatmak gerekiyor.

Makine yeniden başladığında da ayakta kalması için pm2'yi bir kez kaydet ve
süreç listesini sabitle:

```bash
npx pm2 startup   # sudo ile çalıştırılacak bir komut basar; onu çalıştır
npx pm2 save
```

Mac'in kendisinin uyanık olması hâlâ şart: uyuyan makinede hiçbir şey derlenmez.
Prize takılı tut ve uyumasını engelle (Sistem Ayarları → Kilit Ekranı, ya da
`caffeinate -s`).

## Günlük kullanım

```
/new uygulamam       proje oluştur
/use uygulamam       ona geç
<düz yaz>            o projede Claude Code ile konuş
/diff                neyin değiştiğini gör
/preview             dev sunucusunu başlat, telefonu ona bağla
/localbuild          Debug derleyip kabloyla bağlı cihaza kur
/otabuild            imzalı .ipa üret, telefona kurulum linki al
/doctor              kurulumu kontrol et
```

`/otabuild` sana bir HTTPS linki verir. Telefonda **Safari'de** aç ve
"Uygulamayı Yükle"ye bas. Telegram'ın kendi tarayıcısı `itms-services://`
linklerini açamıyor; gerekirse "Safari'de Aç" de. Link 60 dakika sonra ya da
`/otastop` ile kapanır.

`/otabuild` Release üretir (offline çalışır, dev sunucusu gerekmez).
`/otabuild dev` Debug üretir; `/preview` ile eşleşince canlı yenileme çalışır.

Ayrıca `http://127.0.0.1:4300` adresinde iş durumu, canlı loglar ve `.env`
düzenleyicisi olan yerel bir web paneli var.

<details>
<summary>Tüm komutlar</summary>

| Komut | Ne yapar |
|---|---|
| `/help` | komutları listeler |
| `/new <isim> [template]` | proje oluşturur |
| `/templates` | şablonları listeler |
| `/projects` | projeleri listeler |
| `/use <isim>` | aktif projeyi değiştirir |
| `/newchat` | proje seçimini ve Claude oturumunu sıfırlar |
| `/endchat` | Claude oturumunu sonlandırır |
| `/preview` | dev sunucusu + tünel başlatır |
| `/stop` | çalışan önizlemeyi durdurur |
| `/record` | iOS simülatörde kısa video kaydeder |
| `/localbuild [cihaz]` | bağlı cihaza Debug build kurar |
| `/otabuild [dev]` | imzalı `.ipa` + kurulum linki |
| `/otalink` | açık kurulum linkini tekrar gönderir |
| `/otastop` | kurulum linkini kapatır |
| `/qabuild` | EAS'te Release build *(yalnız Expo, kredi harcar)* |
| `/devbuild` | EAS'te development build *(yalnız Expo, kredi harcar)* |
| `/pwd`, `/ls`, `/mkdir`, `/diff` | dosya ve git temelleri |
| `/model` | Claude modelini gösterir/değiştirir |
| `/usage` | token ve maliyet kullanımı |
| `/doctor` | kurulumu kontrol eder |

</details>

## `/otabuild` için imzalama

İşin zor kısmı burası ve sebebi bu proje değil, Apple. Bir uygulamayı fiziksel
bir cihaza kablosuz kurmak iki şey istiyor:

1. **Dağıtım sertifikası** — takım başına bir tane, bir kez üretilir, bütün
   uygulamalarda aynısı kullanılır. Daha önce iOS uygulaması yayınladıysan var.
2. **Ad-hoc provisioning profili** — **bundle id başına**, ve listeye yeni cihaz
   eklediğinde ya da yılda bir süresi dolduğunda yenilenmesi gerekiyor.

İkisini de Apple Developer portalından elle üretebilirsin (Certificates → Apple
Distribution; Profiles → **Ad Hoc**, cihazını seçerek). Hangisinin eksik
olduğunu `/doctor` söyler.

### Ya da profili senin yerine üretsin

Köprüye bir **App Store Connect API anahtarı** verirsen `xcodebuild` eksik
profili kendisi üretiyor, gerekiyorsa cihazı da kaydediyor:

1. App Store Connect → **Users and Access → Integrations → App Store Connect
   API → Team Keys → +**
2. **Rol `Admin` olmak zorunda.** `App Manager` yetmiyor ve hatası fena halde
   yanıltıcı: `No profiles for '<bundleId>' were found` diyor, yani sen profil
   ararken sorun izinde. Anahtarın rolü üretildikten sonra değiştirilemiyor —
   iptal edip yenisini üretmen gerekiyor.
3. `.p8` dosyasını indir (**yalnızca bir kez indirilebiliyor**), sonra:

```bash
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
```

```
ASC_KEY_ID=XXXXXXXXXX
ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Bu **tek seferlik bir bootstrap, kalıcı bir mod değil**: yalnızca ad-hoc profil
hiç yokken devreye giriyor. Xcode ürettiği profili diske kurduğu için sonraki
build'ler normal ve daha hızlı yola dönüyor. Mevcut dağıtım sertifikan yeniden
kullanılıyor, yeni sertifika üretilmiyor.

## React Native CLI'da uzaktan `/preview`

`/preview` Metro'yu tailnet üzerinden servis ediyor, yani telefonun hücresel
veriden bağlanabiliyor. React Native varsayılan olarak dev sunucusuyla düz HTTP
konuşuyor; genel bir HTTPS tüneli bunu servis etmediği için uygulamaya HTTPS
kullanması söylenmeli. Expo projelerinde gerekmiyor — `expo-dev-client` kendi
hallediyor.

İlgili bir React Native hatası [`docs/UPSTREAM_BUGS.tr.md`](docs/UPSTREAM_BUGS.tr.md) içinde
belgelendi: 0.83.1 itibarıyla 8 argümanlı
`jsBundleURLForBundleRoot:packagerHost:packagerScheme:…` kendisine verilen
scheme'i atıyor, yani yalnızca `packagerScheme = "https"` yazmak hiçbir işe
yaramıyor. Geçici çözüm o dosyada.

Telefonun Mac ile aynı Wi-Fi'daysa bunların hiçbiri gerekmiyor.

## Kapsam

Bilerek **desteklenmeyenler**:

- **Çok kullanıcı.** Tek sahip, tek makine — tasarım gereği. Kendinkini çalıştır.
- **Telefona Tailscale kurmak.** Gerekmiyor, planlanmıyor.

**Android** bugün desteklenmiyor — build ve dağıtım katmanı iOS'a özgü — ama
kapalı da değil. Geliştirmek istersen [CONTRIBUTING.md](CONTRIBUTING.md).

## Güvenlik

- Bot tam olarak tek bir Telegram kullanıcısına cevap verir: onu sahiplenene.
- Claude Code sandbox içinde çalışır; bkz. [`docs/SANDBOX.tr.md`](docs/SANDBOX.tr.md).
- Web paneli `127.0.0.1`'e bağlı ve **kimlik doğrulaması yok** — dışarı açma.
- `.env` ve `.p8` anahtarın birer sırdır. `.env` gitignore'da; anahtarı repo
  dışında tut.

## Katkı

[CONTRIBUTING.md](CONTRIBUTING.md) (İngilizce) — kapsam, CI'ın çalıştırdığı
komutlar ve kodu okuyarak anlaşılmayan tek test konvansiyonu.

## Lisans

[MIT](LICENSE)
