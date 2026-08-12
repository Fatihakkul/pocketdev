# Web Arayüzü (planlandı, henüz yazılmadı)

Amaç: bu servisin EAS'in web arayüzüne karşılık gelen paneli. Localhost'ta
çalışan bir React uygulaması; build geçmişini, süren işleri ve yapılandırmayı
tek yerden gösterir.

> Durum (2026-08-11): **panelin ilk sürümü yazıldı.** Üç boşluğun üçü de
> kapandı. Panel `http://127.0.0.1:4300` adresinde, bot süreciyle birlikte
> ayağa kalkıyor. API uçları yerelde test edildi; **tarayıcıda henüz
> kullanılmadı.**

## Verilen kararlar

| Konu | Karar |
| --- | --- |
| Teknoloji | React (Vite), repo içinde `web/` altında |
| Barındırma | Bot süreciyle **aynı process**, mount edilmiş HTTP sunucusu |
| Erişim | Sadece localhost |
| İlk sürüm | Panel (build geçmişi, süren işler, env, komut listesi) |
| Kanal soyutlaması | İkinci adıma bırakıldı |
| Panelden komut tetikleme | **Evet**, ilk sürümde olacak |
| Env görünümü | Sırlar maskeli (`••••`), üzerine yazılabilir; kaydetme sonrası yeniden başlatma gerektiğini bildirir, otomatik restart yok |

**Aynı process zorunluluğu bir tercih değil:** çalışan build/tunnel durumu
runner'ların bellekteki kayıtlarında tutuluyor (`core/runLock.ts` içindeki
`SessionStore` ve `RunLock` örnekleri). Ayrı bir süreç bu durumu göremez;
ayırmak istersek araya IPC veya paylaşılan bir durum deposu girer. Panel bot
sürecine mount edilirse bu sorun hiç doğmuyor.

## Önce kapatılması gereken üç boşluk

Bunlar bugünkü kodda yok; panel yazılmadan önce eklenmeleri gerekiyor.

> Aşağıdaki üç boşluk **kapandı**; ne yapıldığı her maddenin altında.

1. **Build geçmişi diye bir şey yok.** `/qabuild`, `/devbuild`, `/localbuild`,
   `/otabuild` sonuçları yalnızca Telegram mesajı olarak var, hiçbir yere
   kaydedilmiyor. Bir kayıt katmanı gerekiyor (öneri: `data/builds.jsonl` —
   append-only, eşzamanlı yazımda bozulmaya `state.json`'ın oku-değiştir-yaz
   döngüsünden daha dayanıklı). Kaydedilecek alanlar: tip, konfigürasyon, proje,
   başlangıç/bitiş, durum, süre, çıktı yolu/URL, hata özeti, log dosyası yolu.
   **Geçmiş sıfırdan başlayacak** — bugüne kadarki build'ler geri getirilemez.
2. **Ortak bir "çalışan işler" görünümü yok.** Her runner kendi durumunu ayrı
   tutuyor (`isBuilding`, `isRunning`, `isServing`). Bunları tek bir kayıt
   defterinde toplamak gerekiyor: iş tipi, proje, başlangıç zamanı, son log
   satırı, iptal edilebilir mi.
3. ~~**Handler'lar Telegraf'a gömülü.**~~ **Kapandı (2026-08-11).** Ayrıntı
   aşağıda.

## Kanal katmanı (yazıldı)

| Dosya | İşi |
| --- | --- |
| `src/channel.ts` | `CommandContext`, `Responder`, `ProgressMessage`, `Command` tipleri |
| `src/commands.ts` | Tüm komutların tek kaynağı (ad, açıklama, argüman biçimi, takma adlar) |
| `src/channels/telegram.ts` | Telegraf'ı `Responder`'a saran adaptör |
| `src/markup.ts` | Kanal bağımsız `kod` / **kalın** işaretlemesi |

Handler'lar artık Telegraf'ı tanımıyor; `ctx.respond` üzerinden cevap veriyorlar.
`src/telegramUtils.ts` gereksiz kaldığı için silindi.

Dikkat edilen üç nokta:

- **Parçalama kanalın işi.** Telegram'ın 4096 karakter sınırı adaptörde;
  handler'lar bilmiyor, panelde bu sınır zaten yok.
- **İşaretleme HTML değil.** `preview.ts` çıplak adres gönderemiyor, çünkü
  Telegram adresi linkleştirince kullanıcı uygulama yerine tarayıcıya düşüyor ve
  fast refresh'siz web sürümü açılıyor. Bu yüzden handler `\`kod\`` yazıyor,
  her kanal kendi biçimine çeviriyor — HTML üretmek adaptörde kaldı.
- **İlerleme mesajı ilk sınıf.** Sekiz handler'da tekrar eden
  "gönder → düzenle → sil" kalıbı `respond.progress()` altında; dönen nesnenin
  `update()` ve `remove()` metotları var.

`/start`, `/help`'in takma adı olarak korundu — refactor sırasında düşmüştü,
komut listeleri karşılaştırılarak yakalandı (23 komut, parite tam).

**Yardım metni artık kayıt defterinden üretiliyor** (`help.ts`); elle tutulan
liste kalktı, dolayısıyla yeni komut eklerken güncellenmeyi unutma sorunu yok.

### Nasıl kapatıldılar

İlk iki boşluk tek bir soyutlamayla çözüldü: `src/jobs.ts`. Handler'lar zaten
işin başını, sonunu ve hatasını sarmalıyordu; oraya takılan bir "iş" kaydı hem
canlı durumu hem geçmişi veriyor. `startJob()` bir `Job` döndürüyor
(`progress()`, `succeed()`, `fail()`), biten iş `data/builds.jsonl`'e ekleniyor.

JSONL seçildi çünkü her satır bağımsız: `state.json`'daki oku-değiştir-yaz
döngüsünün aksine, eşzamanlı biten iki işten biri diğerini ezemiyor.

Bağlanan komutlar: `/otabuild`, `/localbuild`, `/qabuild`, `/devbuild`.

## Panel

| Dosya | İşi |
| --- | --- |
| `src/jobs.ts` | Çalışan işler + kalıcı build geçmişi |
| `src/envFile.ts` | `.env` okuma/yazma, sır maskeleme |
| `src/panel/server.ts` | HTTP API + derlenmiş paneli servis etme |
| `src/channels/web.ts` | Panelden tetiklenen komutlar için `Responder` |
| `web/` | React (Vite) uygulaması |

Uçlar: `GET /api/state`, `PUT /api/env`, `POST /api/commands/:name`,
`POST /api/projects/pick|link|unlink`.

### Projeler görünümü

`/projects` listesinin panel karşılığı, üstüne **Proje ekle** butonu: workspace
dışındaki bir klasörü projeymiş gibi kullanılabilir hale getirir.

- **Klasör seçimi sunucu tarafında.** Tarayıcı bir klasörün gerçek dosya sistemi
  yolunu veremiyor (`<input webkitdirectory>` yalnızca göreli isimler verir), o
  yüzden `osascript`'in `choose folder` diyaloğu açılıyor. Panel zaten
  127.0.0.1'e bağlı, yani kullanıcı o Mac'in başında. Diyalog Finder'da açılır,
  tarayıcıda değil — panel uzaktan açıldıysa çalışmaz, bu yüzden "yol yaz"
  seçeneği duruyor.
- **Bağlama noktası üç fonksiyon:** `resolveProjectPath`, `projectExists`,
  `listProjects`. Her komut bunlardan geçtiği için bağlanan klasör Telegram
  tarafında da workspace projesi gibi davranır; komutların hiçbiri değişmedi.
- **Sandbox bağlı projelerde bilinçli olarak atlanıyor** (`workspace.ts`):
  workspace kökünün altında olmadıkları için `resolveInside` onları reddederdi.
  Kullanıcının açıkça seçtiği klasör sınırın kendisi sayılıyor.
- **Kayıtlar bellekte** (`core/projectRegistry.ts`): bot yeniden başlayınca
  bağlı projeler kaybolur. Kalıcılık istenirse tek yapılacak Map'i `state.ts`
  üzerinden diske yazmak; arayüz bunu zaten söylüyor.
- Aktif proje değiştirme ayrı bir uç değil, mevcut `/use` komutunu çalıştırıyor
  — doğrulama ve mesajlar tek yerde kalsın diye.

### Tasarım kararları

Sol kenar çubuğu + üç görünüm (Genel bakış / Komutlar / Ayarlar). Genel bakış
şu sırayla: KPI satırı → çalışan işler → geçmiş tablosu.

- **KPI satırı grafik değil, stat tile.** Veri "birkaç başlık sayısı"
  olduğunda doğru form bu; ayrıca geçmiş bu özellikle sıfırdan başladığı için
  iki noktalı bir grafik bilgi vermek yerine yanıltırdı.
- **Durum rozetleri ikon + etiket taşıyor, renk tek başına anlam taşımıyor.**
  Palet doğrulayıcısı ölçtü: "başarılı" yeşili ile "hata" kırmızısı deuteranopi
  altında ΔE 4.1 — kırmızı-yeşil renk körlüğü olan biri ikisini renkten ayırt
  edemiyor. Glif (`✓` / `✕` / `◐`) ve metin anlamı taşıyor.
- **Süre çubuğu tek hue'lu (sequential) mavi.** İşi büyüklük karşılaştırması,
  kimlik değil — o yüzden kategorik renk yok. En uzun build'e göre ölçekleniyor.
- Renkler dataviz referans paletinden; açık/koyu tema ayrı ayrı tanımlı.

### Tarayıcıda bakınca çıkan ve düzeltilen dört şey

Renk doğrulayıcısı yerleşimi kontrol etmiyor; panel açılıp bakıldığında:

1. **Komut butonları süren iş varken kilitlenmiyordu.** Kilit yalnızca web'den
   tetiklenen komutlara bakıyordu; Telegram'dan başlatılmış bir build panelde
   ikinci bir tetiklemeyi engellemiyordu. İkisi de `build/app.xcarchive`'a
   yazdığı için gerçek bir çakışma riskiydi — artık çalışan işler de sayılıyor.
2. Hata satırındaki **log dosyası yolu görünmüyordu**, oysa KPI "son loglara
   bak" diyordu.
3. **Çok satırlı `xcodebuild` hataları tek satıra sıkışıyordu** (`pre-wrap` yok).
4. Proje/tarih sütunları uzun hata metinleri yüzünden sarılıyordu.

Çalıştırma: `npm run deploy` artık paneli de derliyor. Arayüz üzerinde
çalışırken `npm run web:dev` (Vite, 4301) API'yi 4300'e proxy'liyor.

**Yerelde doğrulananlar:** 22 komut listeleniyor; `/projects` panelden
çalıştırılıp çıktı dönüyor; bilinmeyen komut 404; `BOT_TOKEN` değeri istemciye
gitmiyor (`value: undefined`, yalnızca `hasValue: true`); dizin gezinme ham
`..` ile 403, yüzde-kodlu varyantlar SPA fallback'ine düşüyor ve hiçbirinde
`.env` sızmıyor.

## Panelden komut tetikleme

İlk sürümde olacak. Kanal soyutlamasının tamamı olmadan yapılabilmesi için
minimum yol: komutları çağıran ince bir katman + kanal bağımsız bir cevap
arayüzü (`reply(text)`, `progress(text)`), Telegram ve web'in ayrı uygulaması.
Handler'ların tamamını refactor etmek gerekmiyor; önce tetiklenecek olanlar
(`/otabuild`, `/localbuild`, `/preview`, `/qabuild`) taşınır.

Dikkat: panel 20 dakikalık build tetikleyebilir hale geliyor. Aynı işten ikincisi
başlatılmasın diye mevcut `isBuilding` kontrolleri tetikleme yolunda da
uygulanmalı; buton süren iş varken pasif olmalı.

## Env düzenleme

- `.env` okunur, değerler panelde gösterilir; `BOT_TOKEN` gibi hassas anahtarlar
  maskelenir ve mevcut değer istemciye **hiç gönderilmez**.
- Kaydetme `.env`'i günceller. Otomatik restart **yok** — o sırada süren bir
  build veya açık bir tunnel varsa kesilir. Panel "yeniden başlatma gerekiyor"
  uyarısı gösterir.
- `config.ts` env'i import anında okuduğu için değişiklikler ancak yeniden
  başlatınca etkili olur; bu davranış korunuyor.

## Sonraki adım (bu sürümden sonra)

Kanal katmanı: komut kayıt defteri (isim, açıklama, argüman şeması, handler) +
kanal adaptörleri. Telegram mevcut davranışını korur, web ikinci adaptör olur,
Discord/WhatsApp üçüncü/dördüncü olarak eklenir. Panelin komut listesi bu kayıt
defterinden beslenir — bugün `help.ts` içindeki elle yazılmış metin yerine.
