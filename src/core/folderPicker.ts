import { execa } from "execa";
import { m } from "../i18n/index.js";

/** Kullanıcı diyaloğu görmezden gelirse süreç sonsuza kadar beklemesin. */
const PICKER_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * macOS'un kendi klasör seçme diyaloğunu açar ve seçilen yolu döner; kullanıcı
 * vazgeçerse `undefined`.
 *
 * Tarayıcı bir klasörün gerçek dosya sistemi yolunu veremiyor (güvenlik gereği
 * `<input type="file" webkitdirectory>` yalnızca göreli isimler verir). Panel
 * bot süreciyle aynı Mac'te ve yalnızca 127.0.0.1'e bağlı olduğu için diyaloğu
 * sunucu tarafında açmak hem mümkün hem de doğru yer: kullanıcı zaten o
 * makinenin başında.
 *
 * Diyalog Finder'da açılır, tarayıcıda değil — panel uzaktan açılmışsa bu akış
 * çalışmaz, o yüzden elle yol girme yolu da korunuyor.
 */
export async function chooseFolder(promptText = "Proje klasörünü seç"): Promise<string | undefined> {
  const script = `POSIX path of (choose folder with prompt "${promptText.replace(/"/g, '\\"')}")`;

  const { stdout, exitCode, timedOut } = await execa("osascript", ["-e", script], {
    timeout: PICKER_TIMEOUT_MS,
    reject: false,
  });

  if (timedOut) throw new Error(m().runtime.folderPickerTimedOut);
  // Vazgeçildiğinde osascript 1 ile çıkıyor ("User canceled."); bu hata değil.
  if (exitCode !== 0) return undefined;

  // `choose folder` yolu sondaki eğik çizgiyle veriyor.
  const picked = stdout.trim().replace(/\/$/, "");
  return picked.length > 0 ? picked : undefined;
}
