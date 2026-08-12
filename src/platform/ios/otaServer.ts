import { execa } from "execa";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { AddressInfo } from "node:net";
import { openTunnel, preflight as tunnelPreflight, selectedProvider } from "./tunnel.js";

/**
 * Tüneli açmadan, sağlayıcının kullanılabilir olduğunu doğrular. `start()`
 * çağrılmadan çok önce — archive'dan da önce — çalıştırılmak için var.
 */
export const preflight = tunnelPreflight;

// iOS kurulum dosyalarını yalnızca bu sabit adlarla servis ediyoruz. Dizin
// gezinme (path traversal) riski böylece hiç doğmuyor — istek yolu doğrudan
// dosya sistemine çevrilmiyor.
const ROUTES: Record<string, { file: string; contentType: string }> = {
  "/app.ipa": { file: "app.ipa", contentType: "application/octet-stream" },
  "/manifest.plist": { file: "manifest.plist", contentType: "text/xml" },
  "/icon-57.png": { file: "icon-57.png", contentType: "image/png" },
  "/icon-512.png": { file: "icon-512.png", contentType: "image/png" },
};

export interface OtaSession {
  /** Tunnel'ın verdiği https adresi — manifest.plist'e bu gömülür. */
  publicUrl: string;
  /** Servis edilen dosyaların konacağı klasör. */
  serveDir: string;
  stop(): Promise<void>;
}

export interface InstallPageInfo {
  appName: string;
  version: string;
}

function renderInstallPage(publicUrl: string, info: InstallPageInfo): string {
  const manifestUrl = `${publicUrl}/manifest.plist`;
  const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${info.appName} kurulumu</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family:-apple-system,system-ui,sans-serif; background:#f2f2f7; color:#1c1c1e; }
  @media (prefers-color-scheme: dark) { body { background:#000; color:#f2f2f7; } .card { background:#1c1c1e; } }
  .card { background:#fff; border-radius:20px; padding:32px 24px; width:min(92vw,380px);
          text-align:center; box-shadow:0 2px 20px rgba(0,0,0,.08); }
  h1 { font-size:22px; margin:0 0 4px; }
  .version { font-size:15px; opacity:.6; margin:0 0 28px; }
  a.install { display:block; background:#007aff; color:#fff; text-decoration:none;
              padding:16px; border-radius:14px; font-size:17px; font-weight:600; }
  .note { font-size:13px; opacity:.6; margin-top:24px; line-height:1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>${info.appName}</h1>
    <p class="version">Sürüm ${info.version}</p>
    <a class="install" href="${installUrl}">Uygulamayı Yükle</a>
    <p class="note">Buton çalışmıyorsa sayfayı <strong>Safari</strong>'de açtığından emin ol.
    Kurulum başladıktan sonra ana ekranı kontrol et.</p>
  </div>
</body>
</html>
`;
}

/**
 * Kurulum dosyalarını servis eden yerel bir HTTP sunucusu açar ve önüne bir
 * tunnel koyar (varsayılan: Tailscale Funnel, bkz. `tunnel.ts`).
 *
 * HTTPS zorunlu: iOS düz `http` üzerinden `itms-services` kurulumunu reddediyor.
 * ngrok'un ücretsiz katmanı araya bir uyarı sayfası koyduğu için `.ipa`'yı
 * indiren `installd` orada takılıyor (bkz. docs/LOCAL_BUILD.md).
 */
export async function start(
  serveDir: string,
  info: InstallPageInfo,
  onAttemptFailed?: (attempt: number, total: number, message: string) => void
): Promise<OtaSession> {
  fs.mkdirSync(serveDir, { recursive: true });

  let publicUrl = "";
  const server = http.createServer((req, res) => {
    const route = ROUTES[(req.url ?? "/").split("?")[0] ?? "/"];

    if (!route) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderInstallPage(publicUrl, info));
      return;
    }

    const filePath = path.join(serveDir, route.file);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }

    res.writeHead(200, {
      "content-type": route.contentType,
      "content-length": fs.statSync(filePath).size,
    });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;

  const closeServer = (): Promise<void> => new Promise((resolve) => server.close(() => resolve()));

  const logPath = path.join(serveDir, `${selectedProvider()}.log`);

  try {
    // healthPath verilmiyor: OTA sunucusu `/`'da kurulum sayfasını 200 ile
    // döndürüyor, varsayılan kontrol burada doğru.
    const tunnel = await openTunnel(port, logPath, { onAttemptFailed });
    publicUrl = tunnel.publicUrl;
    return {
      publicUrl,
      serveDir,
      stop: async () => {
        await tunnel.stop();
        await closeServer();
      },
    };
  } catch (error) {
    await closeServer();
    throw error;
  }
}

/**
 * Kurulum ekranında görünecek ikonları üretir. `manifest.plist` bu iki boyutu
 * ister; eksiklerse kurulum çalışır ama ikon yerinde boşluk kalır.
 */
export async function generateIcons(sourceIcon: string, serveDir: string): Promise<void> {
  if (!fs.existsSync(sourceIcon)) return;
  for (const size of [57, 512]) {
    await execa("sips", ["-z", String(size), String(size), sourceIcon, "--out", path.join(serveDir, `icon-${size}.png`)], {
      reject: false,
    });
  }
}
