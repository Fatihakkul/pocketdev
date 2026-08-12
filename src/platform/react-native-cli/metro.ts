import fs from "node:fs";
import { runProcess, type ManagedProcess } from "../../core/processRunner.js";
import { reactNativeBin } from "./cli.js";
import { m } from "../../i18n/index.js";

/** RN CLI'ın varsayılan bundler portu; `run-ios` da bunu bekliyor. */
export const METRO_PORT = 8081;

const READY_TIMEOUT_MS = 3 * 60 * 1000;
const READY_POLL_INTERVAL_MS = 1000;

/**
 * Metro'nun hazır olup olmadığını `/status` uç noktasından okur.
 *
 * Log çıktısına desen bakmak yerine bu seçildi: RN CLI "Dev server ready"
 * satırını yalnızca `args.interactive` doğruyken basıyor ve metin sürümden
 * sürüme değişiyor. `/status` ise RN'in kendi araçlarının kullandığı kanonik
 * kontrol (`cli-tools/isPackagerRunning`, `community-cli-plugin/isDevServerRunning`)
 * ve `X-React-Native-Project-Root` başlığı sayesinde sunucunun HANGİ projeye
 * ait olduğunu da söylüyor.
 */
export type MetroStatus =
  | { state: "running"; projectRoot: string }
  | { state: "port-taken" }
  | { state: "down" };

export async function probeMetro(port = METRO_PORT): Promise<MetroStatus> {
  try {
    const res = await fetch(`http://localhost:${port}/status`);
    const body = (await res.text()).trim();
    if (body !== "packager-status:running") return { state: "port-taken" };
    return { state: "running", projectRoot: res.headers.get("X-React-Native-Project-Root") ?? "" };
  } catch {
    return { state: "down" };
  }
}

/** Sembolik bağlantılar yüzünden (/tmp → /private/tmp) ham karşılaştırma yanılıyor. */
function samePath(a: string, b: string): boolean {
  if (a === "" || b === "") return false;
  const real = (p: string): string => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  return real(a) === real(b);
}

export interface MetroHandle {
  /** Bu süreci biz mi başlattık? Başkasınınkini öldürmüyoruz. */
  readonly owned: boolean;
  /** Süreç kendi kendine ölürse çözülür. Devralınan sunucuda hiç çözülmez. */
  readonly whenClosed: Promise<void>;
  stop(): Promise<void>;
}

/**
 * Metro'yu bu süreç altında başlatır — ya da zaten çalışan bir tanesini devralır.
 *
 * `react-native run-ios`'un kendi başlattığı packager KULLANILMIYOR: RN CLI onu
 * macOS'ta ayrı bir Terminal.app penceresi açarak çalıştırıyor
 * (`--terminal`, varsayılan iTerm.app), yani bot ne çıktısını görebiliyor ne de
 * kapatabiliyor. Bu yüzden `run-ios` her yerde `--no-packager` alıyor.
 *
 * Port kontrolü şart: `react-native start`, aynı proje için bir sunucu zaten
 * ayaktaysa "Exiting." deyip **0 ile çıkıyor** (runServer.ts). O durumda süreci
 * beklemek "beklenmedik şekilde sonlandı" hatası verirdi — oysa Metro çalışıyor.
 * Başka bir projenin sunucusu portu tutuyorsa devralmak daha kötü olurdu:
 * telefona sessizce yanlış uygulama inerdi.
 *
 * `detached` şart: Metro worker süreçleri doğuruyor ve grup öldürülmezse
 * `stop()` sonrası arkada yaşamaya devam ediyor.
 */
export async function startMetro(projectPath: string, port = METRO_PORT): Promise<MetroHandle> {
  const existing = await probeMetro(port);
  if (existing.state === "running") {
    if (!samePath(existing.projectRoot, projectPath)) {
      throw new Error(
        `${port} portunda başka bir projenin dev sunucusu çalışıyor (${existing.projectRoot || "bilinmeyen klasör"}).\n` +
          "Onu kapat ya da /stop ile önceki önizlemeyi durdur."
      );
    }
    // Bu projenin sunucusu zaten ayakta (ör. terminalden elle başlatılmış).
    // Devralıyoruz ama sahiplenmiyoruz: /stop başkasının süreçlerini öldürmemeli.
    return { owned: false, whenClosed: new Promise<void>(() => {}), stop: async () => {} };
  }
  if (existing.state === "port-taken") {
    throw new Error(`${port} portunu Metro olmayan başka bir süreç tutuyor. Önce onu kapat.`);
  }

  // Timeout yok: dev sunucu kasıtlı olarak uzun ömürlü.
  const metro = runProcess(reactNativeBin(projectPath), ["start", "--port", String(port)], {
    cwd: projectPath,
    detached: true,
  });

  try {
    await waitUntilReady(metro, projectPath, port);
    return {
      owned: true,
      whenClosed: Promise.resolve(metro.child).then(() => undefined),
      stop: () => metro.stop(),
    };
  } catch (error) {
    const detail = metro.logs.describe();
    await metro.stop();
    throw new Error(`${(error as Error).message}\n\n${detail}`);
  }
}

async function waitUntilReady(metro: ManagedProcess, projectPath: string, port: number): Promise<void> {
  // Süreç erken çıkarsa beklemenin anlamı yok; hemen hata veriyoruz.
  let exited = false;
  void Promise.resolve(metro.child).then(() => {
    exited = true;
  });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const status = await probeMetro(port);
    if (status.state === "running" && samePath(status.projectRoot, projectPath)) return;
    if (exited) {
      throw new Error(m().runtime.metroExited);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Metro ${Math.round(READY_TIMEOUT_MS / 1000)} sn içinde hazır olmadı.`);
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
  }
}
