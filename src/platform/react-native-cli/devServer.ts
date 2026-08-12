import path from "node:path";
import type { DevServer } from "../adapter.js";
import { openTunnel } from "../ios/tunnel.js";
import { METRO_PORT, startMetro } from "./metro.js";

/**
 * RN CLI dev sunucusu: Metro + kendi tünelimiz.
 *
 * Expo tarafındaki `--tunnel` bayrağının karşılığı yok — `react-native start`
 * yalnızca yerel arayüzü dinliyor. Bu yüzden tünel `platform/ios/tunnel.ts`
 * üzerinden açılıyor (varsayılan Tailscale Funnel). Yan etkisi olumlu: RN CLI
 * tarafı ngrok'a hiç bağlanmıyor, yani Adım 3'ün hedeflediği yol burada
 * baştan kurulu.
 *
 * DOĞRULANMAMIŞ: Funnel yalnızca 443/https veriyor, RN'in dev client'ı ise
 * bundle'ı varsayılan olarak `http://host:port` ile istiyor
 * (`RCTBundleURLProvider`). Expo dev client'ın https tüneliyle çalıştığı
 * görüldü; RN CLI'da gerçek bir cihazla sınanmadı. Buradan bir bağlantı hatası
 * gelirse sorun Metro'da değil şemadadır ve çözümü Adım 3'e ait.
 */
export async function start(projectPath: string): Promise<DevServer> {
  const metro = await startMetro(projectPath, METRO_PORT);

  let tunnel;
  try {
    tunnel = await openTunnel(METRO_PORT, path.join(projectPath, "build", "metro-tunnel.log"), {
      // Metro kök yolunu servis etmiyor (`HEAD /` → 404); `/status` ise
      // `packager-status:running` ile 200 dönüyor. Varsayılan `/` ile kontrol
      // tüneli asla "hazır" saymıyor ve 4 dakika sonra boşuna pes ediyor.
      healthPath: "/status",
    });
  } catch (error) {
    await metro.stop();
    throw error;
  }

  return {
    // RN CLI'da istemciyi açan bir URL şeması yok; adres dev menüsüne elle girilir.
    connectHint: undefined,
    serverUrl: tunnel.publicUrl,
    clientName: "uygulamayı",
    whenClosed: metro.whenClosed,
    stop: async () => {
      // Sıra önemli: tünel önce kapanmalı, yoksa kısa bir süre ölü bir porta
      // işaret eden açık bir adres kalıyor. Metro'yu devraldıysak `stop()` zaten
      // hiçbir şey yapmıyor — başkasının sürecini öldürmüyoruz.
      await tunnel.stop();
      await metro.stop();
    },
  };
}
