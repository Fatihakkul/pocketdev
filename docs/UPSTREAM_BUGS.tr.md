# Upstream hatalar

*[English](UPSTREAM_BUGS.md)*

Bu projeyi kurarken bağımlılıklarda bulunan, **bizim kodumuzda olmayan** hatalar.
Her biri için: nasıl bulundu, kanıt, geçici çözüm, ve bildirildi mi.

---

## 1. React Native 0.83.1 — `packagerScheme` bundle URL'ine hiç ulaşmıyor

**Durum:** bildirilmedi (2026-08-12)
**Etki:** iOS dev client'ı https üzerinden Metro'ya bağlanamıyor. Bu, HTTPS-only
bir tünelin (Tailscale Funnel, cloudflared) arkasındaki Metro'yu kullanılamaz
kılıyor — yani uzaktan geliştirmenin tamamını.

### Hata

`React/Base/RCTBundleURLProvider.mm`, 8 argümanlı aşırı yükleme:

```objc
+ (NSURL *)jsBundleURLForBundleRoot:(NSString *)bundleRoot
                       packagerHost:(NSString *)packagerHost
                     packagerScheme:(NSString *)scheme        // ← parametre alınıyor
                          enableDev:(BOOL)enableDev
                 enableMinification:(BOOL)enableMinification
                    inlineSourceMap:(BOOL)inlineSourceMap
                        modulesOnly:(BOOL)modulesOnly
                          runModule:(BOOL)runModule
{
  return [self jsBundleURLForBundleRoot:bundleRoot
                           packagerHost:packagerHost
                         packagerScheme:nil                   // ← ve yok sayılıyor
                              enableDev:enableDev
                     enableMinification:enableMinification
                        inlineSourceMap:inlineSourceMap
                            modulesOnly:modulesOnly
                              runModule:runModule
                      additionalOptions:nil];
}
```

`scheme` parametresi alınıp kullanılmıyor; yerine `nil` geçiliyor. Aşağıda
`serverRootWithHostPort` `nil` şemayı `"http"`ye çeviriyor:

```objc
static NSURL *serverRootWithHostPort(NSString *hostPort, NSString *scheme)
{
  if (![scheme length]) {
    scheme = @"http";
  }
  ...
}
```

Instance metodu tam bu yolu kullandığı için ayar hiçbir zaman etkili olmuyor:

```objc
- (NSURL *)jsBundleURLForBundleRoot:(NSString *)bundleRoot fallbackURLProvider:(...)
{
  ...
  return [RCTBundleURLProvider jsBundleURLForBundleRoot:bundleRoot
                                           packagerHost:packagerServerHostPort
                                         packagerScheme:[self packagerScheme]   // ← boşuna
                                              ...];
}
```

### Kanıt

Cihazda (iPhone 11, iOS 18.6.2), `AppDelegate.bundleURL()` içine konan geçici
`NSLog` ile:

```
[bridge] jsLocation=<host>.ts.net:443  scheme=https  url=http://<host>.ts.net:443/index.bundle?...
```

`packagerScheme` **https** olarak okunuyor, üretilen URL yine de **http**.

Aynı `packagerScheme` değeri başka yerlerde doğru çalışıyor — yani ayarın
kendisi sağlam, kırık olan yalnızca bu URL kurulumu:

- `packagerServerHostPort` → `isPackagerRunning:location scheme:@"https"`
  çağrısı https ile başarılı oldu (aksi hâlde `location` nil olur, uygulama
  gömülü bundle'a düşerdi)
- `RCTPackagerConnection` websocket şemasını yine buradan okuyor

### Geçici çözüm

9 argümanlı sürümü (`additionalOptions:` alanı) doğrudan çağırmak — o, şemayı
olduğu gibi aktarıyor:

```swift
RCTBundleURLProvider.jsBundleURL(
  forBundleRoot: "index",
  packagerHost: location,
  packagerScheme: "https",
  enableDev: settings.enableDev,
  enableMinification: settings.enableMinification,
  inlineSourceMap: settings.inlineSourceMap,
  modulesOnly: false,
  runModule: true,
  additionalOptions: nil
)
```

Tam bağlam ve `AppDelegate` bloğunun tamamı: `V2.md` → "Doğrulanmamış
noktalar" → 1. madde.

### Önerilen düzeltme

8 argümanlı aşırı yükleme `packagerScheme:nil` yerine aldığı `scheme`'i
geçirmeli. Tek satır:

```diff
   return [self jsBundleURLForBundleRoot:bundleRoot
                            packagerHost:packagerHost
-                         packagerScheme:nil
+                         packagerScheme:scheme
                               enableDev:enableDev
```

### Bildirim taslağı (İngilizce)

> **`RCTBundleURLProvider` drops `packagerScheme`, forcing `http://` for the JS bundle URL**
>
> **Version:** react-native 0.83.1 (iOS)
>
> In `React/Base/RCTBundleURLProvider.mm`, the 8-argument
> `+jsBundleURLForBundleRoot:packagerHost:packagerScheme:enableDev:enableMinification:inlineSourceMap:modulesOnly:runModule:`
> takes a `scheme` argument but forwards `packagerScheme:nil` to the
> 9-argument overload. `serverRootWithHostPort` then substitutes `"http"`.
>
> Because the instance method `-jsBundleURLForBundleRoot:fallbackURLProvider:`
> goes through that overload, setting
> `RCTBundleURLProvider.sharedSettings().packagerScheme = "https"` has no
> effect on the bundle URL, even though the same setting is correctly honored
> by `-packagerServerHostPort` (via `+isPackagerRunning:scheme:`) and by
> `RCTPackagerConnection`.
>
> **Repro:** set `packagerScheme = "https"` and a `jsLocation` pointing at an
> HTTPS-only host, then read the URL returned by
> `jsBundleURLForBundleRoot:`. Observed on device:
> `scheme=https` but `url=http://<host>:443/index.bundle?...`
>
> **Impact:** the iOS dev client cannot load a bundle over HTTPS, so Metro
> cannot be reached through an HTTPS-only tunnel (Tailscale Funnel,
> cloudflared quick tunnels). Note the dev menu's "Configure Bundler" has no
> scheme field either, so there is no way to work around this from the device.
>
> **Fix:** forward `scheme` instead of `nil` in that overload.
