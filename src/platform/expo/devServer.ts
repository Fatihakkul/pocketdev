import fs from "node:fs";
import path from "node:path";
import { runProcess } from "../../core/processRunner.js";
import type { DevServer } from "../adapter.js";
import { readExpoConfig } from "./config.js";
import { m } from "../../i18n/index.js";

const NGROK_API_URL = "http://localhost:4040/api/tunnels";
const TUNNEL_POLL_INTERVAL_MS = 2000;
const TUNNEL_POLL_TIMEOUT_MS = 20 * 60 * 1000;

interface NgrokTunnel {
  public_url: string;
  proto: string;
}

interface NgrokTunnelsResponse {
  tunnels: NgrokTunnel[];
}

function hasDevClient(projectPath: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf-8"));
    return Boolean(pkg?.dependencies?.["expo-dev-client"]);
  } catch {
    return false;
  }
}

// Deep link şeması olarak `ios.bundleIdentifier` kullanılır. expo-dev-client
// bunu ayrı bir URL şeması olarak Info.plist'e kaydeder (kontrol:
// `plutil -extract CFBundleURLTypes json -o - ios/<app>/Info.plist` — orada
// hem bundleIdentifier hem Expo config'teki `scheme` görünür).
//
// Not: dev launcher linki yalnızca host'a göre tanır
// (EXDevLauncherURLHelper.swift: `url.host == "expo-development-client"`),
// şemaya bakmaz — yani iki şema da işe yarar. Link açılmıyorsa sebep şema
// değildir; büyük ihtimalle build Release'dir ve dev launcher hiç çalışmıyordur
// (bkz. qaBuildRunner.ts'teki açıklama).
async function getIosBundleIdentifier(projectPath: string): Promise<string | undefined> {
  try {
    return (await readExpoConfig(projectPath))?.ios?.bundleIdentifier;
  } catch {
    return undefined;
  }
}

async function waitForTunnelUrl(): Promise<string> {
  const deadline = Date.now() + TUNNEL_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(NGROK_API_URL);
      if (res.ok) {
        const data = (await res.json()) as NgrokTunnelsResponse;
        const httpsTunnel = data.tunnels.find((t) => t.proto === "https");
        if (httpsTunnel) return httpsTunnel.public_url;
      }
    } catch {
      // ngrok API henüz ayakta değil, denemeye devam et
    }
    await new Promise((resolve) => setTimeout(resolve, TUNNEL_POLL_INTERVAL_MS));
  }
  throw new Error(m().runtime.tunnelUrlTimeout);
}

/**
 * Expo dev sunucusunu tünelle başlatır ve cihazın bağlanacağı adresleri döner.
 *
 * Oturum kaydı burada tutulmuyor: `workflows/previewRunner.ts` sahipleniyor,
 * böylece aynı defter RN CLI adapter'ında da kullanılabiliyor.
 */
export async function start(projectPath: string): Promise<DevServer> {
  const expoBin = path.join(projectPath, "node_modules", ".bin", "expo");
  if (!fs.existsSync(expoBin)) {
    throw new Error(m().runtime.expoCliMissing);
  }

  const usesDevClient = hasDevClient(projectPath);
  const args = usesDevClient ? ["start", "--dev-client", "--tunnel"] : ["start", "--tunnel"];
  // CI=1 KOYMA: Expo CLI watch modunu doğrudan buna bağlıyor
  // (`isWatchEnabled()` → `return !env.CI`, instantiateMetro.ts), yani CI=1 ile
  // Metro dosyaları hiç izlemez ve /preview'da fast refresh ölür. İnteraktif
  // terminal UI için de gerekmez: stdout pipe'landığından `process.stdout.isTTY`
  // undefined kalır ve Expo zaten non-interactive çalışır.
  //
  // Timeout yok: dev sunucu /stop'a kadar yaşamalı.
  const server = runProcess(expoBin, args, { cwd: projectPath, detached: true });

  // Süreç erken çıkarsa tunnel adresi hiç gelmeyecek demektir; 20 dakika
  // sessizce beklemek yerine hemen hata dönüyoruz. `Promise.race` her iki
  // promise'e de dinleyici bağladığı için geç gelen ret sahipsiz kalmıyor.
  const exitedEarly = Promise.resolve(server.child).then((result) => {
    throw new Error(`expo süreci beklenmedik şekilde sonlandı (exit code: ${result.exitCode ?? "?"}).`);
  });

  try {
    const publicUrl = await Promise.race([waitForTunnelUrl(), exitedEarly]);

    let connectHint: string;
    if (usesDevClient) {
      const bundleId = await getIosBundleIdentifier(projectPath);
      if (!bundleId) {
        throw new Error(m().runtime.noBundleIdentifierForLink);
      }
      connectHint = `${bundleId}://expo-development-client/?url=${encodeURIComponent(publicUrl)}`;
    } else {
      connectHint = `exp://${new URL(publicUrl).host}`;
    }

    return {
      connectHint,
      serverUrl: publicUrl,
      clientName: usesDevClient ? "development build'ini" : "Expo Go'yu",
      whenClosed: Promise.resolve(server.child).then(() => undefined),
      stop: () => server.stop(),
    };
  } catch (error) {
    const detail = server.logs.describe();
    await server.stop();
    throw new Error(`${(error as Error).message}\n\n${detail}`);
  }
}
