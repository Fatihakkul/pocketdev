import { execa, type Result, type ResultPromise } from "execa";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MAX_LINES = 80;
const DEFAULT_TAIL_LINES = 20;
const DEFAULT_PROGRESS_INTERVAL_MS = 60_000;
const MAX_PROGRESS_LINE_LENGTH = 200;

/**
 * Gerçek hata satırları. İki biçim var:
 * - `dosya.cpp:12:3: error: ...` — clang/xcodebuild
 * - `error Failed to build ios project...` — RN CLI'ın `logger.error` öneki;
 *   başarısız build script'inin çıktısını da satır satır bu önekle basıyor,
 *   `Duplicate plugin/preset detected.` gibi asıl sebep orada geçiyor.
 *
 * İkincisi satır BAŞINA bağlı: `-Werror=...` gibi derleyici bayrakları satır
 * ortasında geçiyor ve yakalanmamalı.
 */
const ERROR_LINE = /(^|\s)error:|^error\s/;

export type ProgressFn = (elapsedMs: number, lastLine?: string) => void;

/**
 * Uzun süren süreçlerin çıktısı iki farklı yere gidiyor: son N satır bellekte
 * (Telegram'a/panele gidecek özet), tamamı isteğe bağlı olarak bir dosyaya.
 *
 * Tam log şart: `xcodebuild` hatası çoğu zaman çıktının ortasında geçiyor ve
 * kuyrukta yalnızca `** ARCHIVE FAILED **` özeti görünüyor — asıl satır
 * (ör. "Signing for ... requires a development team") kuyruğa hiç düşmüyor.
 */
export class LogBuffer {
  private readonly lines: string[] = [];
  private readonly file?: fs.WriteStream;
  /**
   * Son chunk'ın satır sonuyla bitmeyen kuyruğu.
   *
   * Chunk sınırı satır sınırı DEĞİL: pipe tamponu dolduğunda tek bir satır iki
   * okumaya bölünüyor. Bu kuyruk tutulmazsa parçalar ayrı satır sanılıyor ve
   * özet anlamsızlaşıyor — gerçek vaka: `xcodebuild`'in dev clang komutu tam
   * `-W` ile `error=non-modular-include...` arasından bölündü, kuyrukta
   * "error ..." diye başlayan sahte satırlar göründü ve asıl `error:` satırı
   * hiç eşleşmedi.
   */
  private partial = "";

  constructor(
    private readonly maxLines = DEFAULT_MAX_LINES,
    readonly filePath?: string
  ) {
    if (filePath) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      this.file = fs.createWriteStream(filePath);
    }
  }

  append(chunk: unknown): void {
    const text = String(chunk);
    this.file?.write(text);

    const parts = (this.partial + text).split("\n");
    // Son parça satır sonu görmedi; tamamlanana kadar bekletiliyor.
    this.partial = parts.pop() ?? "";
    this.push(parts);
  }

  private push(rawLines: string[]): void {
    for (const raw of rawLines) {
      const line = raw.trim();
      if (line.length > 0) this.lines.push(line);
    }
    if (this.lines.length > this.maxLines) {
      this.lines.splice(0, this.lines.length - this.maxLines);
    }
  }

  /** Bekleyen kuyruğu satır olarak kabul eder — süreç satır sonu yazmadan bitebilir. */
  private flush(): void {
    if (this.partial.length === 0) return;
    const pending = this.partial;
    this.partial = "";
    this.push([pending]);
  }

  close(): void {
    this.flush();
    this.file?.end();
  }

  /**
   * Okuyucuların gördüğü satırlar. Bekleyen kuyruk da dahil: süreç henüz
   * kapanmamışken (ilerleme mesajı) ya da kapanış sırası garanti değilken
   * (`finished()` içindeki `describe()`) son satırın kaybolmaması gerekiyor.
   */
  private snapshot(): string[] {
    const pending = this.partial.trim();
    return pending.length > 0 ? [...this.lines, pending] : this.lines;
  }

  /** İlerleme mesajı için son satır, taşmasın diye kırpılmış. */
  last(maxLength = MAX_PROGRESS_LINE_LENGTH): string | undefined {
    const all = this.snapshot();
    const line = all[all.length - 1];
    if (!line) return undefined;
    return line.length > maxLength ? `${line.slice(0, maxLength)}…` : line;
  }

  tail(count = DEFAULT_TAIL_LINES): string {
    return this.snapshot().slice(-count).join("\n");
  }

  errors(): string[] {
    return this.snapshot().filter((line) => ERROR_LINE.test(line));
  }

  /**
   * Hata gövdesi: `error:` satırları varsa onlar (gürültüsüz ve isabetli),
   * yoksa kuyruk. Tam log dosyası varsa yolu her zaman eklenir.
   */
  describe(): string {
    const errors = this.errors();
    const body = errors.length > 0 ? `Hatalar:\n${errors.slice(-8).join("\n")}` : `Son loglar:\n${this.tail()}`;
    return this.filePath ? `${body}\n\nTam log: ${this.filePath}` : body;
  }
}

export interface RunOptions {
  cwd: string;
  /**
   * Verilmezse süreç kendi başına sonlanana ya da `stop()` çağrılana kadar
   * yaşar. Dev sunucu ve tünel gibi kasıtlı olarak uzun ömürlü süreçler için
   * timeout vermek yanlış: 30 dakika sonra çalışan bir Metro'yu öldürürdü.
   */
  timeoutMs?: number;
  /** Verilirse çıktının TAMAMI buraya yazılır; hata mesajlarında yolu geçer. */
  logFilePath?: string;
  maxLines?: number;
  env?: NodeJS.ProcessEnv;
  /**
   * Kendi süreç grubunda başlatır. Metro gibi alt süreç doğuran komutlar için
   * şart: grup öldürülmezse `stop()` sonrası Metro arkada yaşamaya devam ediyor.
   */
  detached?: boolean;
  onProgress?: ProgressFn;
  progressIntervalMs?: number;
}

export interface ManagedProcess {
  /** Özel akışlar için (çıktıda desen bekleme, yarış kurma) ham süreç. */
  readonly child: ResultPromise;
  readonly logs: LogBuffer;
  readonly startedAt: number;
  elapsedMs(): number;
  /**
   * Sürecin bitmesini bekler; sıfırdan farklı çıkışta ya da timeout'ta
   * biçimlendirilmiş hata fırlatır. `label` hata metninin öznesi olur
   * ("Archive başarısız (exit 65).").
   */
  finished(label: string): Promise<Result>;
  /**
   * Çıktıda desen görünene kadar bekler ve eşleşen metni döner. Süreç desen
   * gelmeden biterse ya da süre dolarsa hata fırlatır — beklemek yerine hemen
   * hata vermek önemli, yoksa hiç gelmeyecek bir satır için dakikalarca
   * sessizce bekleniyor.
   *
   * Eşleşme yığın (chunk) bazında yapılır: desen tam olarak iki okuma arasına
   * bölünürse yakalanmaz. Beklenen satırlar (`Opening on`, tünel adresi) tek
   * yazımda geldiği için pratikte sorun çıkarmıyor.
   */
  waitForOutput(pattern: RegExp, timeoutMs: number, label: string): Promise<string>;
  /** Süreci (detached ise tüm grubu) sonlandırır. */
  stop(): Promise<void>;
}

/**
 * Tek bir uzun süren komut çalıştırmanın ortak iskeleti: log toplama, periyodik
 * ilerleme bildirimi, timeout, biçimlendirilmiş hata ve temiz sonlandırma.
 *
 * `reject: false` bilinçli: çıkış kodunu kendimiz yorumluyoruz, çünkü execa'nın
 * fırlattığı hata mesajı komut satırını içeriyor ama logu içermiyor.
 */
export function runProcess(file: string, args: string[], options: RunOptions): ManagedProcess {
  const startedAt = Date.now();
  const logs = new LogBuffer(options.maxLines, options.logFilePath);

  const child = execa(file, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    timeout: options.timeoutMs,
    detached: options.detached,
    cleanup: true,
    reject: false,
  });

  // Bekleyen desenler tek bir veri yolundan geçiyor: dinleyiciyi sonradan
  // eklemek, `waitForOutput` çağrılana kadar akan çıktıyı kaçırma riski taşır.
  const matchers = new Set<{ pattern: RegExp; hit: (match: string) => void }>();

  const onChunk = (chunk: unknown): void => {
    const text = String(chunk);
    logs.append(text);
    for (const matcher of [...matchers]) {
      const found = matcher.pattern.exec(text);
      if (found) {
        matchers.delete(matcher);
        matcher.hit(found[0]);
      }
    }
  };

  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);
  void Promise.resolve(child).finally(() => logs.close());

  const elapsedMs = (): number => Date.now() - startedAt;

  const progressTimer = options.onProgress
    ? setInterval(
        () => options.onProgress?.(elapsedMs(), logs.last()),
        options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS
      )
    : undefined;

  const stop = async (): Promise<void> => {
    if (progressTimer) clearInterval(progressTimer);
    const pid = child.pid;
    if (options.detached && pid) {
      try {
        process.kill(-pid, "SIGTERM");
        return;
      } catch {
        // süreç grubu zaten yok; tekil kill'e düşüyoruz
      }
    }
    child.kill("SIGTERM");
  };

  return {
    child,
    logs,
    startedAt,
    elapsedMs,
    stop,
    waitForOutput(pattern: RegExp, timeoutMs: number, label: string): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          matchers.delete(matcher);
          fn();
        };

        const timer = setTimeout(
          () => finish(() => reject(new Error(`${label} zaman aşımına uğradı (${Math.round(timeoutMs / 1000)} sn).`))),
          timeoutMs
        );
        const matcher = { pattern, hit: (match: string) => finish(() => resolve(match)) };
        matchers.add(matcher);

        void Promise.resolve(child).then(() =>
          finish(() =>
            reject(new Error(`${label}: süreç beklenmedik şekilde sonlandı.\n\n${logs.describe()}`))
          )
        );
      });
    },
    async finished(label: string): Promise<Result> {
      try {
        const result = await child;
        if (result.exitCode !== 0) {
          const reason = result.timedOut
            ? `${label} zaman aşımına uğradı (${Math.round((options.timeoutMs ?? 0) / 60_000)} dk).`
            : `${label} başarısız (exit ${result.exitCode ?? "?"}).`;
          throw new Error(`${reason}\n\n${logs.describe()}`);
        }
        return result;
      } finally {
        if (progressTimer) clearInterval(progressTimer);
      }
    },
  };
}
