# Kanal oturumlarının kum havuzu

*[English](SANDBOX.md)*

Kanal (Telegram/panel) üzerinden açılan Claude oturumlarının erişimini sınırlar.
**Kullanıcının kendi interaktif Claude Code oturumunu etkilemez** — politika
yalnızca `claudeRunner`'ın `--settings` ile spawn ettiği sürece verilir;
`~/.claude/settings.json` ve proje içi `.claude/settings.json` el değmez. Aynı
sebeple ileride eklenecek hook'lar da bu inline JSON'a girmeli.

## Neden gerekliydi

2026-08-11 ölçümü: bot üzerinden açılan bir oturum, pratikte `you`
kullanıcısının yapabildiği her şeye erişebiliyordu — `~/.ssh`, Keychain, diğer 9
proje, sınırsız ağ çıkışı, ve ortamında botun `BOT_TOKEN`'ı. O günkü kısıtlar
gerçek bir sınır değil, **prefix string eşleşmeli bir filtreydi**:
`Bash(curl*)` yazılıydı ama `node -e "fetch(...)"` serbestti.

Asıl risk yetkisiz kullanıcı değil (Telegram tarafı tek `ALLOWED_USER_ID` ile
kilitli): okunan bir repo dosyası, `node_modules` içeriği veya WebFetch'lenen bir
sayfa üzerinden gelen **prompt injection**, tam yetkiyle çalışan bir ajanla
buluşuyordu. System prompt ve `RULES.md` bu senaryoda yumuşak katman.

## İki katman, ikisi de gerekli

| Katman | Nereye uygulanır | Neyi bağlar |
| --- | --- | --- |
| `sandbox.*` | macOS'ta seatbelt (`sandbox-exec`), Linux'ta `bwrap` | Bash ile çalıştırılan komutlar — çekirdek seviyesi |
| `permissions.deny` | CLI sürecinin içi | `Read` / `Edit` / `Write` araçları |

Yalnız sandbox yazmak yetmez: `cat` engellenir ama Claude `Read` aracını
kullanır. Ölçümde tam olarak bu oldu — `cat ~/.ssh/id_ed25519` engellendi,
`Read` aynı dosyayı okudu.

## Ölçülen davranış (`src/claude/sandbox.ts`)

Kontrollü karşılaştırma — aynı komutlar sandbox açık ve kapalıyken:

| Kontrol | Sandbox açık | Sandbox kapalı |
| --- | --- | --- |
| `Read` ile `~/.ssh/id_ed25519` | ENGELLENDİ | (kural yok) |
| `cat ~/.ssh/id_ed25519` | ENGELLENDİ | BAŞARILI |
| `Read` ile kardeş projedeki dosya | ENGELLENDİ | — |
| `Read` ile botun `.env`'i | ENGELLENDİ | — |
| Aktif proje içine yazma | ÇALIŞIYOR | ÇALIŞIYOR |
| `curl registry.npmjs.org` (allowlist'te) | HTTP 200 | HTTP 200 |
| `curl example.com` (liste dışı) | 000 (engellendi) | HTTP 200 |

## Üç tuzak (hepsi ölçümle bulundu)

### 1. İzin kurallarında tek eğik çizgi workspace kökü demek

`Read(/Users/you/.ssh/**)` kuralı `<proje>/Users/you/.ssh` olarak
yorumlanıyor ve **hiç eşleşmiyor**. Dosya sistemi kökü için çift eğik çizgi
gerekiyor: `Read(//Users/you/.ssh/**)`.

Sinsi olan tarafı: yanlış yazılmış kural hata vermiyor, sessizce eşleşmiyor.
İlk uygulamada `~/.ssh` bu yüzden okunabilir kalmıştı ve `permission_denials`
boş döndüğü için "çalışıyor" gibi görünüyordu. `sandbox.filesystem.*` tarafında
ise tek eğik çizgili mutlak yol doğru — iki katmanın sözdizimi farklı.

### 2. Ağ kısıtı proxy ile uygulanıyor

Seatbelt'te `deny default` var; izinli alan adlarına trafik **yerel bir
HTTP/SOCKS proxy** üzerinden geçiyor (CA sertifikası enjekte ediliyor,
`NO_PROXY` localhost ve özel IP aralıklarını dışarıda bırakıyor). Sonucu:

- `curl`, `git`, `npm` proxy'yi onurlandırdığı için allowlist çalışır →
  Claude oturumlarında `npm install` bozulmaz
- Node'un global `fetch`'i `HTTP_PROXY`'yi umursamaz → allowlist'te olsa bile
  geçemez. İlk ağ testimizin yanıltıcı çıkmasının sebebi buydu; **güvenlik
  tarafında ise kazanç**: injection ile gelen `node -e "fetch(...)"` tabanlı bir
  exfiltration denemesi alan adı ne olursa olsun ölür

### 3. Yanlış anahtar sessizce yok sayılır

`failIfUnavailable: true` yalnızca sandbox'ın *kurulamadığı* durumu yakalar.
Anahtar adı hatalıysa politika hiç yüklenmez ve korumalı olduğumuzu sanırız —
1. tuzak tam olarak böyle keşfedildi.

Bu yüzden bot açılışta **kanarya testi** çalıştırıyor
(`src/claude/sandboxSelfTest.ts`): politika reddetmesi gereken bir dosyayı
(`data/state.json`) okumayı dener ve engellendiğini görmeden serbest mesajları
kabul etmez. Doğrulanmadan gelen mesajlara `handleMessage` ret döner.
`SANDBOX_SELFTEST=0` ile kapatılabilir (her açılışta küçük bir model koşusu
maliyeti var), ama varsayılan açık.

## Politikanın kapsamı

**Okumaya kapalı:** `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.docker`, `~/.config/gh`,
`~/.npmrc`, `~/Library/Keychains`, `~/.claude`, botun `.env` ve `data/`
klasörü, **ve aktif projenin tüm kardeşleri**.

Kardeşler çalışma anında sayılıp tek tek reddediliyor. Denylist'te "şu dizin
hariç" ifadesi olmadığı için istisna yazmak yerine kardeşleri saymak gerekti;
bu hem workspace içindeki hem bağlı (workspace dışı) projeler için çalışıyor.

**Ortam değişkenleri allowlist** (`claudeRunner.childEnv`): `PATH`, `HOME`,
`USER`, `SHELL`, `TMPDIR`, dil/`TERM` değişkenleri ve `ANTHROPIC_*` / `CLAUDE_*`
önekleri geçer. `BOT_TOKEN`, `ALLOWED_USER_ID` ve sonradan eklenecek her sır
otomatik olarak dışarıda kalır — denylist yazsaydık her yeni sır sızardı.
`SSH_AUTH_SOCK` de kasıtlı olarak yok: geçseydi `~/.ssh` okunamasa bile ajan
üzerinden anahtarlarla imzalama yapılabilirdi.

## Bilinen boşluklar

- **Komut niyeti hâlâ string eşleşmesiyle kısıtlı.** `Bash(git commit*)` gibi
  kurallar duruyor ve `git -C /path commit` onları atlar. Gerçek çözüm
  `PreToolUse` hook'u: normalize edilmiş komutu görüp allowlist uygular.
  Yapılmadı.
- **Bot deposunun kendi kaynak kodu okunabilir** (yalnız `.env` ve `data/`
  kapalı). Bot workspace'in üstünde durduğu için kardeş sayımına girmiyor.
- **Kardeş listesi koşu anında donuyor.** Uzun bir oturum sürerken açılan yeni
  bir kardeş dizin o oturumda reddedilmez; sonraki koşuda listeye girer.
- **Yazma, aktif proje dışında da mümkün olabilir** — açıkça reddedilen yollar
  dışında sandbox'ın varsayılan yazma duruşuna güveniliyor, ölçülmedi.
