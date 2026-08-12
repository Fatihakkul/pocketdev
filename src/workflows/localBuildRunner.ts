import { execa } from "execa";
import type { ProgressFn } from "../core/processRunner.js";
import { RunLock } from "../core/runLock.js";
import { getAdapter } from "../platform/adapter.js";
import { m } from "../i18n/index.js";

export interface AppleDevice {
  name: string;
  udid: string;
  osVersion: string;
}

export interface LocalBuildResult {
  device: AppleDevice;
  durationMs: number;
}

const buildLock = new RunLock();

export function isBuilding(conversationId: number): boolean {
  return buildLock.isActive(conversationId);
}

/** Kullanılabilir cihazlar ve kullanılamayanlar — ikincisi hata mesajını taşıyor. */
export interface DeviceScan {
  available: AppleDevice[];
  unavailable: Array<AppleDevice & { reason: string }>;
}

/**
 * Bağlı fiziksel iOS cihazlarını döner.
 *
 * Kaynak `xcrun xcdevice list`. Üç sebeple:
 *
 * 1. **`xctrace` yanlış negatif veriyor.** Kabloyla bağlı, kilidi açık,
 *    `xcdevice`'ın `available: true` dediği bir iPhone `xctrace`'te
 *    "Devices Offline" altında görünebiliyor (2026-08-12'de birebir yaşandı) —
 *    ve bot çalışabilir bir cihaza "bağlı cihaz yok" diyordu.
 * 2. **RN CLI'ın kendi kaynağı bu.** `cli-platform-apple/tools/listDevices.js`
 *    `xcrun xcdevice list` çağırıp `identifier` alanını `--udid` olarak
 *    kullanıyor; aynı listeden seçmek eşleşmeyi garantiliyor.
 * 3. **UDID biçimi Expo için de doğru.** `xcdevice`, `xctrace` ile aynı klasik
 *    donanım UDID'ini veriyor (`00008030-...`). `xcrun devicectl` ise CoreDevice
 *    UUID'si döndürüyor ve o değer ne Expo'nun ne RN CLI'ın listesinde var.
 */
export async function listConnectedDevices(): Promise<DeviceScan> {
  const { stdout } = await execa("xcrun", ["xcdevice", "list"], { reject: false });
  return parseDeviceList(stdout);
}

interface XcdeviceEntry {
  name?: string;
  identifier?: string;
  platform?: string;
  simulator?: boolean;
  available?: boolean;
  ignored?: boolean;
  operatingSystemVersion?: string;
  error?: { description?: string };
}

/** `xcrun xcdevice list` JSON çıktısını ayrıştırır. Süreçten ayrı, test edilebilir. */
export function parseDeviceList(stdout: string): DeviceScan {
  let entries: XcdeviceEntry[];
  try {
    entries = JSON.parse(stdout);
  } catch {
    return { available: [], unavailable: [] };
  }
  if (!Array.isArray(entries)) return { available: [], unavailable: [] };

  const scan: DeviceScan = { available: [], unavailable: [] };
  for (const entry of entries) {
    // Simülatörler `/localbuild`'in konusu değil; Mac ve watch/tv de öyle.
    if (entry.simulator || entry.ignored) continue;
    if (!entry.platform?.includes("iphoneos")) continue;
    if (!entry.identifier || !entry.name) continue;

    // "18.6.2 (22G100)" → "18.6.2"; build numarası kullanıcıya bir şey söylemiyor.
    const osVersion = (entry.operatingSystemVersion ?? "?").split(" ")[0] ?? "?";
    const device: AppleDevice = { name: entry.name, udid: entry.identifier, osVersion };

    if (entry.available) {
      scan.available.push(device);
    } else {
      scan.unavailable.push({ ...device, reason: entry.error?.description ?? "sebep bildirilmedi" });
    }
  }
  return scan;
}

/**
 * Kullanıcının verdiği değeri (isim veya UDID) bağlı cihazlarla eşleştirir.
 * Değer verilmemişse ve tek cihaz varsa onu seçer; birden fazlaysa seçim ister.
 */
export function resolveDevice(scan: DeviceScan, search?: string): AppleDevice {
  const devices = scan.available;
  const [first, ...rest] = devices;
  if (!first) {
    // Görünen ama kullanılamayan cihaz varsa Xcode'un kendi gerekçesi genel
    // kontrol listesinden çok daha isabetli ("device is locked" gibi).
    const blocked = scan.unavailable.map((d) => `• ${d.name}: ${d.reason}`).join("\n");
    throw new Error(
      "Bağlı iOS cihazı bulunamadı.\n\n" +
        (blocked
          ? `Görünen ama kullanılamayan cihazlar:\n${blocked}\n\n`
          : "") +
        "Kontrol et:\n" +
        "• Telefon Mac'e kabloyla bağlı mı (ya da kablosuz eşleştirildiyse aynı Wi-Fi'da mı)\n" +
        "• Telefon kilidi açık ve \"Bu bilgisayara güven\" onaylanmış mı\n" +
        "• Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu açık mı"
    );
  }

  if (!search) {
    if (rest.length === 0) return first;
    const list = devices.map((d) => `• ${d.name} (${d.osVersion})`).join("\n");
    throw new Error(`Birden fazla cihaz bağlı, hangisine kuracağımı belirt:\n${list}\n\nÖrnek: /localbuild ${first.name}`);
  }

  const needle = search.toLowerCase();
  const device = devices.find((d) => d.udid.toLowerCase() === needle || d.name.toLowerCase() === needle);
  if (!device) {
    const list = devices.map((d) => `• ${d.name} (${d.osVersion})`).join("\n");
    throw new Error(m().runtime.noMatchingDevice(search, list));
  }
  return device;
}

/**
 * Yerel Debug build alır ve cihaza kurar — `/devbuild`'in EAS kredisi harcamayan
 * karşılığı (bkz. docs/LOCAL_BUILD.md). Build komutu proje tipine göre adapter'dan
 * geliyor; buradaki cihaz keşfi ve kilit her proje tipinde ortak.
 */
export async function startLocalBuild(
  conversationId: number,
  projectPath: string,
  device: AppleDevice,
  onProgress?: ProgressFn
): Promise<LocalBuildResult> {
  return buildLock.run(conversationId, "Zaten bir yerel build sürüyor, lütfen bekle.", async () => {
    const adapter = await getAdapter(projectPath);
    const startedAt = Date.now();
    await adapter.runOnDevice(projectPath, device.udid, onProgress);
    return { device, durationMs: Date.now() - startedAt };
  });
}
