# Kurallar (Telegram Köprüsü Oturumları için) — Rules for bridge sessions

> **English:** this file is prepended to every Claude Code session the bridge
> starts (`src/claude/claudeRunner.ts`). Edit it to change what Claude may and
> may not do in your projects — no code change needed, it takes effect on the
> next message. The rules below are the author's; adjust them to your workflow.
> Some are Expo-specific and simply don't apply to React Native CLI projects.

Bu talimatlar, pocketdev üzerinden başlatılan her Claude Code
oturumuna otomatik olarak ekleniyor (bkz. `src/claude/claudeRunner.ts`). Buraya
eklenen her madde, /newchat sonrası başlayan session'da da mevcut session'ın
devamında da geçerli olur.

Aşağıdakiler yazarın kendi kuralları — kendi akışına göre değiştir. Bir kısmı
Expo'ya özgü ve React Native CLI projelerinde geçersiz.

## Build / submit

- `eas build`, `eas submit`, `expo build` gibi komutları **kendin çalıştırma**.
  Bu komutlar zaten Bash izinlerinde engellenmiş durumda, yine de dener veya
  kullanıcı build istersen: build işlemini SEN başlatma, kullanıcıya Telegram'dan
  ilgili komutu çalıştırmasını söyle. Build sadece bu komutlarla, ayrı bir
  süreç üzerinden tetiklenir:
  - `/qabuild` → `preview` profili (Release). Offline çalışır, dev mode yok.
  - `/devbuild` → `development` profili (Debug). Fast refresh için; `/preview`
    ile açılan dev sunucusuna bağlanır, tek başına açılmaz.
  - `/localbuild` → yerelde Debug build (`expo run:ios`). `/devbuild` ile aynı
    sonucu verir ama EAS kredisi harcamaz; karşılığında telefonun Mac'e bağlı
    olmasını ister. Kullanıcı build isterse EAS'i tüketmemek için önce bunu öner.
  - `/otabuild` → yerelde Release `.ipa` + kurulum linki. `/qabuild` ile aynı
    sonucu verir, EAS kredisi harcamaz ve kablo istemez. `/otalink` linki tekrar
    gönderir, `/otastop` kapatır. Kullanıcı QA build isterse önce bunu öner.
  - `/otabuild dev` → aynısının Debug hali, `/devbuild`'in yerine geçer. Kurulum
    sonrası `/preview` ile fast refresh çalışır. Kullanıcı dev build isterse
    kablo takmak istemiyorsa bunu, takabiliyorsa `/localbuild`'i öner.
- `xcodebuild archive`, `xcodebuild -exportArchive` ve `cloudflared` komutlarını
  da **kendin çalıştırma** — bunlar `/otabuild`'in parçası, ayrı süreçten
  tetiklenir.
- `eas.json` içindeki `preview` profiline **`developmentClient: true` EKLEME.**
  `preview` = Release build; JS bundle gömülüdür, Mac'te hiçbir şey açık olmadan
  çalışır. QA için gereken budur ve bayrağı eklersen bu özellik kaybolur.
- **Release build `/preview` ile dev mode'a bağlanamaz — bu bir hata değil.**
  Expo, dev launcher'ı Release'de kapatır:
  `ExpoDevLauncherReactDelegateHandler.swift` içinde
  `if !EXAppDefines.APP_DEBUG { return nil }`, ve `APP_DEBUG` yalnızca
  `#if DEBUG` ile açılır. Kullanıcı "QA build'de fast refresh yok" derse bunu
  deep link şemasıyla veya eas.json ile çözmeye ÇALIŞMA — çözümü ayrı bir Debug
  build almaktır (`/localbuild` ya da elle `npx expo run:ios --device`,
  bkz. docs/LOCAL_BUILD.md).
- `eas credentials`, `eas init` gibi kurulum/yapılandırma komutlarını kullanıcı
  açıkça isterse çalıştırabilirsin (bunlar build tetiklemez).

## Git

- Repo durumunu değiştiren git komutlarını (add, commit, push, pull, merge,
  rebase, reset, checkout, restore, stash, branch, tag, rm, clean, vb.)
  **kendin çalıştırma** — bunlar zaten Bash izinlerinde engellenmiş durumda.
  Git işlemleri tamamen kullanıcının kontrolünde; commit/push gerektiğinde
  kullanıcıya haber ver, kendin yapma.
- `git status`, `git log`, `git show`, `git diff` gibi salt okunur komutları
  kod geçmişini/durumunu anlamak için kullanabilirsin.

## Genel

Yeni kısıtlamalar gerektiğinde bu dosyaya madde eklemek yeterli — kod
değişikliği gerekmez, bir sonraki mesajda otomatik olarak devreye girer.
