# Yerel iOS Build (EAS kredisi harcamadan)

Amaç: geliştirme sürecinde EAS'i hiç veya çok az kullanmak ve build/kurulum
dahil geliştirme adımlarını **sadece telefondan** yürütebilmek. EAS free plan'da
aylık build limiti var; aşağıdaki akış native build'i tamamen MacBook üzerinde
alır ve limitten hiç düşmez.

> Durum (2026-08-11): native build tarafı **uygulandı ve bota bağlandı** —
> `/localbuild` komutu (`src/workflows/localBuildRunner.ts`, `src/commands/handlers/localbuild.ts`).
> `/devbuild` ile aynı Debug build'i verir ama EAS kredisi harcamaz.
> Ortam kontrolü 2026-08-10'da yapıldı.
>
> OTA dağıtımı da **uygulandı ve uçtan uca doğrulandı** (`/otabuild`,
> `/otalink`, `/otastop` — `src/platform/ios/ipaExporter.ts`, `src/platform/ios/otaServer.ts`,
> `src/workflows/otaRunner.ts`). Barındırma VPS'siz: cloudflared TryCloudflare tunnel'ı.
>
> 2026-08-11 doğrulaması: gerçek Debug archive alındı, 31.9 MB `.ipa` export
> edildi, ad-hoc profille imzalandığı (`codesign --verify` → "satisfies its
> Designated Requirement") ve tunnel üzerinden servis edildiği teyit edildi.
> **Telefona fiili kurulum henüz denenmedi** — kalan tek doğrulama adımı bu.

## Ortam (doğrulandı)

| Gereken | Durum |
| --- | --- |
| Xcode | 26.6 |
| CocoaPods | 1.16.2 |
| Apple Developer hesabı | Ücretli — Team `TEAMID1234` |
| Provisioning profile | Wildcard `TEAMID1234.*`, 2027-07-12'ye kadar geçerli |
| Test cihazı | iPhone 11, UDID profile kayıtlı |
| `example-expo-app/ios/` + Pods | Prebuild yapılmış, Pods kurulu |

Profillerin 1 yıl geçerli olması ücretli hesabın kanıtı — ücretsiz "personal
team" profilleri 7 günde bir yenilenmek zorundadır ve bu akışı kullanılamaz
hale getirir. Kontrol etmek için:

```bash
security find-identity -v -p codesigning
ls ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/
```

## Eski EAS akışının yerel karşılığı

Alışılmış döngü şuydu: `/devbuild` (development client'lı build) → linkten kur →
`/preview` → tunnel linkini telefonda aç → deep link ile uygulamaya gir → dev
mode ve fast refresh. Yerel karşılığı birebir aynı, sadece ilk adım değişiyor:

| Adım | EAS ile | Yerel karşılığı |
| --- | --- | --- |
| Debug build + kurulum | `/devbuild` (kredi harcar) | `/otabuild dev` (kredi yok, kablo yok) |
| Debug build, kablo varken | — | `/localbuild` (daha hızlı, link/tunnel gerekmez) |
| Release / QA build | `/qabuild` (kredi harcar) | `/otabuild` |
| Dev sunucu + deep link | `/preview` | `/preview` (aynı, değişiklik yok) |

**Debug build'i dağıtım profiliyle imzalamak fast refresh'i bozmaz.** Dev
launcher `EXAppDefines.APP_DEBUG`'a, yani `#if DEBUG` derleme bayrağına bakıyor;
profildeki `get-task-allow` entitlement'ına değil. Bu tahmin değil: EAS'in
ürettiği development build'i (`f6660dc0`) indirilip açıldı ve içinde
`get-task-allow: False` olan **aynı ad-hoc profil** çıktı
(`*[expo] <bundle-id> AdHoc <seri>`), `main.jsbundle` yok,
`EXDevLauncher.bundle` var. Yani bugüne kadar kullanılan dev build zaten tam
olarak `/otabuild dev`'in ürettiği şey.

`get-task-allow: false` olmasının tek pratik sonucu, uygulamaya lldb ile
debugger bağlanamamasıdır — Metro bağlantısı ve fast refresh bundan etkilenmez.

## Temel akış

### 1. Native build + cihaza kurulum (nadiren)

Telefon Mac'e bağlıyken (USB kablo veya kablosuz eşleştirilmişse aynı Wi-Fi),
Telegram'dan:

```
/localbuild
```

Birden fazla cihaz bağlıysa hangisi olduğunu belirt: `/localbuild Fatih iPhone'u`
(isim ya da UDID kabul edilir).

Elle karşılığı:

```bash
cd workspace/example-expo-app
npx expo run:ios --device <UDID> --configuration Debug --no-bundler
```

Bu komut EAS'in geliştirme tarafında yaptığı her şeyi yerelde yapar: gerekirse
prebuild, `pod install`, `xcodebuild`, imzalama (Xcode otomatik imzalama mevcut
sertifikayı kullanır) ve cihaza kurulum. İlk build 10-20 dakika, sonrakiler
artımlı olduğu için çok daha hızlı.

İki ayrıntı `/localbuild`'in çalışması için şart, elle çalıştırırken de geçerli:

- **`--no-bundler` olmadan süreç bitmez.** `expo run:ios` kurulumdan sonra
  Metro'yu açık tutar (`runIosAsync.js` → `shouldStartBundler`), yani build
  "asılı" görünür. Dev sunucusunu zaten `/preview` ayrı bir tunnel ile başlatıyor.
- **`--device`'a mutlaka bir değer verilmeli.** Değersiz `--device` interaktif
  seçim listesi açar; bot TTY olmadığı için orada takılır. Expo cihazı isim veya
  klasik donanım UDID'siyle eşleştirir (`resolveDevice.js` →
  `findDeviceFromSearchValue`). `xcrun devicectl` CoreDevice UUID'si döndürdüğü
  için orada eşleşmez.

  **Düzeltme (2026-08-12): UDID kaynağı `xctrace` değil, `xcrun xcdevice list`.**
  İlk sürüm `xcrun xctrace list devices` kullanıyordu ve yanlış negatif verdi:
  kabloyla bağlı (`interface: usb`), `xcdevice`'ın `available: true` dediği bir
  iPhone `xctrace` çıktısında **"Devices Offline"** altında göründü — bot da
  çalışabilir cihaza "bağlı iOS cihazı bulunamadı" dedi. `xcdevice` aynı klasik
  donanım UDID'ini veriyor (Expo eşleştirmesi bozulmuyor), üstelik RN CLI'ın
  kendi kaynağı da bu (`cli-platform-apple/tools/listDevices.js` → `identifier`).
  Ek fayda: `available: false` olan cihazlar için `error.description` geliyor
  ("iPhone is locked." gibi), yani hata mesajı genel kontrol listesi yerine
  Xcode'un kendi gerekçesini gösterebiliyor.

### 2. Canlı geliştirme (her zaman)

Telegram'dan `/preview` → Metro + ngrok tunnel başlar, dönen linki telefonda
aç. Fast refresh her ağdan çalışır. Bu kısım zaten kurulu ve çalışıyor,
değişiklik gerekmiyor.

## Debug vs Release

`expo run:ios` varsayılan olarak **Debug** derler; bu build JS bundle'ı içermez,
çalışmak için Metro'ya bağımlıdır. Tunnel kapalıyken de açılabilen bir build
istiyorsan:

```bash
npx expo run:ios --device --configuration Release
```

Release build bundle'ı gömer — bugünkü `/qabuild` çıktısıyla aynı davranır.

## Native build ne zaman gerekir?

Sadece native taraf değiştiğinde:

- Yeni bir native paket eklendi/kaldırıldı
- `app.json` içindeki `plugins`, `ios` veya `android` ayarları değişti

Salt JS/TS/stil/içerik değişikliklerinde gerekmez — Metro üzerinden anında
yansır. (Aynı ayrım `workspace/example-expo-app/AGENTS.md` içinde de yazılı.)
Pratikte ayda birkaç kez telefonu kabloya takmak yeterli oluyor.

## Tek gerçek kısıt

Kurulum anında telefonun Mac'e **fiziksel olarak erişilebilir** olması gerekir.
EAS'in yerelde doğrudan karşılığı olmayan tek özelliği bu: uzaktan indirme
linkiyle kurulum. Native build seyrek gerektiği için pratikte büyük bir engel
değil.

## EAS'e hâlâ ihtiyaç duyulan yerler

- Yanında olmayan test kullanıcılarının cihazına dağıtım
- TestFlight / App Store yüklemesi — ancak bu da yerelde build alıp Xcode veya
  `xcrun altool` ile yüklenerek EAS build kredisi harcamadan yapılabilir

## VPS kullanılabilir mi?

iOS build için **hayır** — macOS + Xcode zorunlu, Linux'ta derlenemez. Geriye
sadece `.ipa` barındırma işi kalıyor, onu da ücretsiz bir tunnel çözüyor
(bkz. "Barındırma: cloudflared"). Yani **VPS alınmayacak.**

## İleride değerlendirilebilecek seçenekler

1. ~~**`/localbuild` Telegram komutu**~~ — 2026-08-11'de yapıldı. Bilinen sınırı
   duruyor: ancak telefon o an Mac'e bağlıysa işe yarar.
2. **Kendi OTA dağıtımın** — telefondan kurulum linkiyle yükleme. Telefon-only
   akışın kilit parçası ve kalan tek adım; ayrıntılı tarif aşağıda.
3. **`eas build --local`** — EAS'in build pipeline'ını kendi makinende çalıştırır,
   kredi harcamaz, bulut build'le birebir aynı `.ipa` üretir. iOS için
   `fastlane` gerekir (şu an kurulu değil). `expo run:ios`'a göre daha ağır ama
   çıktısı dağıtıma daha uygun.

## Kendi OTA dağıtımın (EAS internal distribution'ın yerine)

Amaç: geliştirme adımlarını **sadece telefondan** yürütmek. Build'i Telegram'dan
tetiklemek zaten mümkün, ama `.ipa`'yı telefona **kurmak** için bir indirme
linki gerekiyor — EAS'in verdiği şey bu. Kendin barındırınca döngü tamamen
EAS'siz ve telefon-only hale gelir.

Mekanizmanın sihirli bir tarafı yok, standart iOS ad-hoc OTA kurulumudur.

### Tek seferlik kurulum

1. ~~**Dağıtım sertifikası.**~~ **Tamam (2026-08-11).** Sıfırdan üretmek
   gerekmedi: `/qabuild` zaten `distribution: internal` ile çalıştığı için EAS
   bunu çoktan oluşturmuştu, sadece EAS sunucularında duruyordu. `eas credentials`
   → *Credentials.json: Download credentials from EAS* ile indirildi ve login
   keychain'e aktarıldı. Kimlik: `iPhone Distribution: <AD SOYAD> (<TEAM_ID>)`,
   2027-07-16'ya kadar geçerli.
2. ~~**Ad-hoc dağıtım profili.**~~ **Tamam (2026-08-11).** Aynı indirmeyle geldi:
   `*[expo] <bundle-id> AdHoc`, `get-task-allow: False`, içinde
   kayıtlı cihaz `<UDID>` (iPhone 11), 2027-07-16'ya kadar.
   `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` altına kuruldu.

   Sırlar `workspace/example-expo-app/credentials/ios/` altında (`.p12` + parolası
   `credentials.json` içinde). `workspace/` gitignore'da olduğu için repoya
   girmiyor — dosyalar başka bir yere taşınırsa bu bir daha doğrulanmalı.
3. **HTTPS barındırma.** Geçerli sertifikalı olmak zorunda; iOS düz `http`
   üzerinden kurulumu reddeder. Karar: **cloudflared**, aşağıya bak.

### Barındırma: cloudflared (2026-08-11 kararı)

VPS yerine ücretsiz tunnel kullanılacak:

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8080
```

Hesap gerektirmez, anında geçerli sertifikalı bir `https://xxx.trycloudflare.com`
adresi verir ve araya uyarı sayfası koymaz.

**Neden ngrok değil:** ücretsiz katmanı rastgele domainlerde araya bir uyarı
sayfası koyuyor. `/preview`'da sorun çıkarmıyor çünkü Metro tarayıcı değil, ama
`.ipa`'yı çeken iOS `installd` o sayfayı tıklayamaz ve kurulum sessizce başarısız
olur.

Bunun iki sonucu var:

- **Mac açık olmalı.** VPS'in tek gerçek üstünlüğü linkin Mac kapalıyken de
  çalışmasıydı. Build'i zaten Mac alıyor ve kurulum hemen ardından yapılıyor,
  pratikte kayıp yok. Uykuyu engellemek için `caffeinate -i`.
- **`manifest.plist` export'tan sonra üretilmeli.** Aşağıda "Xcode manifest'i
  senin için üretir" yazıyor ve doğru, ama host'u `ExportOptions.plist`'ten sabit
  gömüyor. TryCloudflare adresi her başlatmada değiştiği için manifest'in
  tunnel ayağa kalktıktan sonra yazılması (ya da içindeki host'un değiştirilmesi)
  gerekiyor. Sabit adres isteniyorsa alternatif `tailscale funnel` — hesap ister
  ama URL sabit kalır ve bu adım tamamen ortadan kalkar.

### Build ve export

```bash
xcodebuild -workspace ios/exampleexpoapp.xcworkspace \
  -scheme exampleexpoapp -configuration Release \
  -archivePath build/app.xcarchive archive

xcodebuild -exportArchive \
  -archivePath build/app.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist
```

`ExportOptions.plist` — dikkat: **Xcode `manifest.plist`'i senin için üretir**,
elle yazman gerekmez. `manifest` anahtarını verdiğinde export çıktısına
`manifest.plist` de eklenir:

```xml
<dict>
  <key>method</key>          <string>release-testing</string>
  <key>signingCertificate</key> <string>iOS Distribution</string>
  <key>manifest</key>
  <dict>
    <key>appURL</key>             <string>https://HOST/example-expo-app.ipa</string>
    <key>displayImageURL</key>    <string>https://HOST/icon-57.png</string>
    <key>fullSizeImageURL</key>   <string>https://HOST/icon-512.png</string>
  </dict>
</dict>
```

`method` değerine dikkat: klasik `ad-hoc` **deprecated**, güncel karşılığı
`release-testing` (Xcode 26'da `xcodebuild -help` ile doğrulandı; `development`
de `debugging` oldu).

`signingCertificate` değerine de dikkat: `Apple Distribution` ve
`iOS Distribution` **ayrı** otomatik seçicilerdir, birbirinin yerine geçmez.
Buradaki sertifika Apple'ın eski tipinde (`iPhone Distribution: DEVELOPER NAME`),
yani doğru değer `iOS Distribution`. `Apple Distribution` yazılırsa export
"eşleşen sertifika yok" diyerek patlar.

### Yayınlama ve kurulum linki

`.ipa`, `manifest.plist` ve iki ikon dosyası cloudflared tunnel'ının arkasındaki
yerel HTTP sunucusundan servis edilir (`src/platform/ios/otaServer.ts`). Kurulum linkinin
biçimi:

```
itms-services://?action=download-manifest&url=https://HOST/manifest.plist
```

**cloudflared adresi loga düştüğü anda hazır değil.** DNS yayılması birkaç saniye
sürüyor ("it may take some time to be reachable"); beklemeden kullanılırsa hem
export hem de kullanıcının tıkladığı link "host bulunamadı" veriyor. `otaServer`
bu yüzden adresi yakaladıktan sonra cevap verene kadar yokluyor
(`waitUntilReachable`). Ölçüm: normalde 11-20 saniyede açılıyor.

### TryCloudflare kota sınırı — çözülmemiş asıl sorun

**TryCloudflare hesapsız quick tunnel oluşturmayı IP başına sınırlıyor.** Sınıra
takılınca cloudflared şunu basıyor:

```
ERR Error unmarshaling QuickTunnel response: error code: 1015
    status_code="429 Too Many Requests"
```

Cloudflare 1015 = rate limit. Belirtiler sinsi: sınıra yaklaşırken tunnel açılıyor
ama kaydolmuyor (adres üretiliyor, `Registered tunnel connection` satırı hiç
çıkmıyor, ad DNS'te 133 saniye boyunca görünmüyor); tamamen takılınca ise adres
hiç üretilmiyor. 2026-08-11'de gün içinde ~15 tunnel açıldıktan sonra sınıra
girildi.

Yanlış çıkan iki hipotez, ölçümle elendi:

- **QUIC/UDP engeli değil.** `--protocol quic` 4/4 başarılı (10-33 sn),
  `--protocol http2` 4/4 adres bile alamadı. QUIC tek çalışan protokol.
- **Geçici DNS dalgalanması değil.** Log kaydı eklenince görüldü ki hata
  DNS'te değil, tunnel oluşturma isteğinde (HTTP 429).

Kod artık 1015/429 görünce **yeniden denemiyor** — kota sınırında her deneme
sınırdan bir hak daha yakıyor. Kaydolmuş ama yayılmamış tunnel için 180 sn,
kaydolmamış için 45 sn bekliyor; ayrım önemli çünkü ölçümde bir tunnel 33
saniyede açıldı ve sabit kısa süreyle pes etmek çalışacak tunnel'ı öldürüyordu.

Cloudflare'in kendi uyarısı da bunu söylüyor: "If you intend to use Tunnels in
production you should use a pre-created named tunnel." Her `/otabuild` yeni
tunnel açtığı ve bot sık yeniden başladığı için sınır kaçınılmazdı.

## Barındırma: Tailscale Funnel (2026-08-11 kararı)

TryCloudflare kota sorunu yüzünden varsayılan sağlayıcı **Tailscale Funnel**
oldu. Funnel kalıcı bir servis: adres makineye sabit
(`<makine>.<tailnet>.ts.net`), her build'de yeniden "oluşturulmadığı" için quick
tunnel'ları vuran IP başına oluşturma kotası burada yok. Sertifika geçerli, yani
iOS'un `itms-services` şartını karşılıyor.

Sağlayıcı seçimi `src/platform/ios/tunnel.ts` içinde ve `OTA_TUNNEL` ile değiştirilebiliyor:

```bash
OTA_TUNNEL=cloudflared   # yedek; kota sınırına takılabilir
```

cloudflared kod yolu duruyor ve kota davranışını doğru yönetiyor (1015/429
görünce yeniden denemiyor), ama varsayılan değil.

### Tek seferlik Tailscale kurulumu

```bash
brew install tailscale            # yapıldı
sudo brew services start tailscale
tailscale up                      # tarayıcıda giriş
```

Ardından admin konsolunda iki şey açık olmalı: **HTTPS sertifikaları** ve bu
makine için **Funnel** izni. Eksikse `tailscale funnel` çalıştırıldığında hangi
ayarın gerektiğini ve yönlendirme linkini kendisi yazdırıyor.

Kod, servis kapalıysa veya oturum açık değilse ne yapılması gerektiğini
söyleyen bir hata döndürüyor (`resolveTailscaleHostname`).

Servis edilen yollar sabit bir listeden geliyor (`ROUTES`), istek yolu dosya
sistemine hiç çevrilmiyor — dizin gezinme riski yok.

### İmzalama profili açıkça belirtiliyor

`ExportOptions.plist`'e `signingStyle: manual` ve `provisioningProfiles` yazılıyor.
Otomatik seçime bırakmak riskli: makinede aynı uygulamayı kapsayan bir
development wildcard profili de kurulu (`TEAMID1234.*`) ve yanlışı seçilirse
üretilen `.ipa` OTA ile kurulamaz. Profil, kurulu profiller taranıp bundle id'si
eşleşen ve `get-task-allow: false` olan kayıt seçilerek bulunuyor
(`findAdHocProfile`).

Ayrıştırmada bir tuzak var: **profilin tamamı JSON'a çevrilemiyor.**
`DeveloperCertificates` alanı ikili veri içerdiği için `plutil -convert json`
tüm dosyada `Invalid object in plist for JSON format` veriyor. Çözüm anahtarları
tek tek çekmek (`plutil -extract UUID raw` / `-extract Entitlements json`).

### Archive'ın imzalama ayarları (ilk `/otabuild` denemesinde çıkan hatalar)

`expo run:ios` çalışırken ham `xcodebuild archive`'ın patlamasının sebebi şu:
Expo CLI imzalamayı kendisi çözüp ayarları build anında enjekte ediyor
(`codeSigning/xcodeCodeSigning.js`), `xcodebuild` ise bu yardımı almıyor.
Prebuild edilmiş proje imzalama ayarlarını içermiyor. Sırayla çıkan iki hata:

1. `error: Signing for "exampleexpoapp" requires a development team.`
   → `DEVELOPMENT_TEAM=<takım>` geçilmeli. Takım kimliği ad-hoc profilin
   `com.apple.developer.team-identifier` entitlement'ından okunuyor.
2. `error: Provisioning profile "iOS Team Provisioning Profile: *" doesn't
   include the aps-environment entitlement.`
   → Otomatik imzalama, wildcard **development** profilini seçiyor ve o profilde
   push notification yetkisi yok. Çözüm otomatik seçimi hiç kullanmamak:
   `CODE_SIGN_STYLE=Manual` + `PROVISIONING_PROFILE_SPECIFIER=<profil UUID>` +
   `CODE_SIGN_IDENTITY=<sertifika SHA-1>`.

Sertifika kimliği isimle değil **SHA-1 parmak iziyle** veriliyor
(`findDistributionIdentity`): keychain'de hem `Apple Development` hem
`iPhone Distribution` var ve isim eşleşmesi önek bazlı çalıştığı için sertifika
tipi ileride değişirse sessizce yanlışını seçebilir.

### Loglar

`xcodebuild` çıktısının tamamı `build/archive.log` ve `build/export.log`
dosyalarına yazılıyor; Telegram'a yalnızca `error:` satırları (yoksa son 20
satır) ve tam log dosyasının yolu gidiyor. Bu gerekli çünkü asıl hata çoğu zaman
çıktının ortasında kalıyor — kuyrukta sadece `** ARCHIVE FAILED **` özeti
görünüyor ve hatanın kendisi hiç düşmüyor.

### Archive öncesi prebuild (2026-08-11'de eklendi)

`xcodebuild archive` yalnızca **mevcut** Pods'u derliyor: yeni eklenen bir native
paketi projeye almıyor, config plugin'leri de hiç çalıştırmıyor. Build yine de
başarıyla geçtiği için sorun ancak cihazda görünüyor.

Gerçek vaka: `react-native-google-mobile-ads` package.json'a eklenmiş ama
`ios/Podfile.lock` bir gün öncesinden kalmıştı (içinde tek bir `GoogleMobileAds`
satırı yok, `Pods.xcodeproj`'de `RNGoogleMobileAds` geçmiyor, `Info.plist`'te
`GADApplicationIdentifier` yok). Debug build kurulup `/preview` ile bağlanınca
Metro taze JS'i veriyor, o JS de derlenmemiş modülü istiyor:
`TurboModuleRegistry.get('RNGoogleMobileAdsModule') could not be found`.

`/otabuild` artık archive'dan önce `syncNativeProject()` çağırıyor
(`ipaExporter.ts`):

- **Tetikleyici:** `package.json` + `app.json` içeriğinin SHA-1'i,
  `build/prebuild-stamp.json`'daki damgayla karşılaştırılıyor. Damga yoksa
  yedek ölçüt `Podfile.lock`'tan yeni bir girdi dosyası olup olmadığı.
  Mtime yerine içerik özeti kullanılıyor: `npm install` ve git checkout
  mtime'ları durduk yere değiştiriyor.
- **Damga prebuild'den SONRA hesaplanıyor**, çünkü prebuild girdilerin kendisini
  değiştirebiliyor — önceden alınan özet bir sonraki build'de gereksiz ikinci bir
  prebuild tetiklerdi.
- **`--clean` yok:** o, `ios/` klasörünü silip sıfırdan üretiyor ve elle yapılmış
  native düzenlemeleri de götürüyor. Üzerine yazan varsayılan mod bağımlılık ve
  plugin değişikliklerini almaya yetiyor.
- Prebuild'in imzalama ayarlarını ezmesi sorun değil: `archive()` takımı, profili
  ve kimliği zaten komut satırından veriyor.
- Çıktının tamamı `build/prebuild.log`'a yazılıyor, ilerleme Telegram'a
  "Native proje eşitleniyor (expo prebuild)" olarak düşüyor.

`/localbuild` bu adıma ihtiyaç duymuyor — `expo run:ios` prebuild'i kendisi
çalıştırıyor. `/qabuild` de EAS'te derlediği için etkilenmiyor. Boşluk yalnızca
ham `xcodebuild` yolundaydı.

### Debug archive'da ONLY_ACTIVE_ARCH

Debug şeması varsayılan olarak `ONLY_ACTIVE_ARCH=YES` ile gelir. `generic/platform=iOS`
hedefine archive alırken "aktif mimari" diye bir şey olmadığından bu, cihazda
çalışmayan bir binary üretebiliyor; `archive` çağrısına `ONLY_ACTIVE_ARCH=NO`
eklendi. Release'de zaten `NO` olduğu için orada fark etmiyor.

### Safari tuzağı (önemli)

`itms-services://` linkleri **Telegram'ın kendi tarayıcısında çalışmaz**, Safari
gerekir. Bu, 2026-08-10'da `/preview` linkinde yaşanan sorunun aynısıdır:
Telegram özel şemayı açmaz, düz metne düşürür veya gömülü alan adını linkleştirip
tarayıcıya yönlendirir.

Çözüm: linki doğrudan Telegram'a gönderme. VPS'te küçük bir HTML sayfası barındır
(`itms-services://` linki o sayfada bir buton olsun), Telegram'a o sayfanın
`https://` adresini gönder, kullanıcı Safari'de açıp butona bassın.

### Sınırlar

- **Cihaz UDID'si profile kayıtlı olmak zorunda.** Yeni test cihazı eklemek =
  profili yeniden üret + yeniden build al. Bu EAS'te de aynıdır, EAS'in cihaz
  kaydettirmesinin sebebi budur.
- Profil ve sertifikanın süresi dolduğunda yenilenmesi gerekir.

### Tamamlanmış telefon-only döngü

`/otabuild` bu dört adımı tek komutta yapıyor:

1. Telegram'dan build tetiklenir → Mac yerelde Release archive alır (EAS kredisi yok)
2. cloudflared tunnel açılır, ardından `.ipa` export edilir — bu sıra zorunlu,
   çünkü `manifest.plist` host'u içine sabit gömüyor
3. Telegram'a kurulum sayfasının `https://` adresi gelir
4. Safari'de açılır → "Uygulamayı yükle?" → kurulur

Tunnel 60 dakika sonra ya da `/otastop` ile kapanır; adres tekrar lazım olursa
`/otalink`. Bot kapanırken de tüm tunnel'lar kapatılıyor (`otaRunner.stopAll`).

### Alternatif: TestFlight

UDID kaydı gerektirmez, sınırsız test kullanıcısı, ücretsiz. Karşılığında App
Store Connect'e yükleme ve işlenme süresi vardır (iç testçilere anında, dış
testçilere inceleme sonrası). Yerelde build alıp yüklersen EAS build kredisi
harcamazsın — sertifika/profil/barındırma yönetimiyle de uğraşmazsın, ama
kurulum akışı tamamen Apple'ın kontrolünde olur.

## Hedef: ürünleştirme

Bu yerel dağıtım akışı tek seferlik komutlar olarak kalmayacak; bir **uygulama**
haline getirilecek. Planlanan yön:

1. **Uygulamalaştırma** — yerel build + dağıtım akışı (prebuild, imzalama,
   `.ipa` üretimi, cihaza kurulum) elle çalıştırılan komutlar yerine tek bir
   uygulamanın sağladığı işlevler olacak.
   → Native build + kurulum kısmı **yapıldı** (`/localbuild`, 2026-08-11).
   Kalan: `.ipa` üretimi + OTA dağıtımı.
2. **Telegram projesiyle birlikte paketleme** — **karar verildi:** tek uygulama,
   tek repo. Monorepo'ya bölünmeyecek; build/dağıtım akışı
   `pocketdev` içinde modül olarak yaşayacak
   (`src/workflows/localBuildRunner.ts` gibi).
3. **GitHub'a push** — **yapıldı** (2026-08-11). Repo:
   `Fatihakkul/pocketdev`, private.
4. **Arayüz** — **karar verildi ama ertelendi:** geçmiş build'lerin görülebildiği
   ve bugün Telegram'dan tetiklenen işlemlerin butonlarla tetiklenebildiği bir
   Electron.js uygulaması olacak. OTA dağıtımı bitmeden başlanmayacak.

### Bu adıma geçmeden önce çözülmesi gerekenler

- ~~Proje henüz bir git deposu değil~~ — 2026-08-11'de `git init` + ilk commit
  yapıldı, GitHub'a push edildi.
- **Sırlar repoya girmemeli.** `.env` içinde `BOT_TOKEN` ve `ALLOWED_USER_ID`
  var. 2026-08-11 kontrolü: `.gitignore` `.env`, `workspace/`, `data/`, `dist/`,
  `scratch/` girişlerini içeriyor ve takip edilen tek env dosyası `.env.example`
  — durum temiz. Her push öncesi bunun hâlâ geçerli olduğu doğrulanmalı.
- ~~Arayüzün türü belirlenmedi~~ / ~~Paketlemenin kapsamı belirlenmedi~~ —
  ikisi de karara bağlandı, yukarıya bak.
