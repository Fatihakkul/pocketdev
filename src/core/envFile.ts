import fs from "node:fs";
import path from "node:path";

/**
 * `.env` okuma/yazma — panelin yapılandırma ekranı için.
 *
 * Sır sayılan anahtarların DEĞERİ istemciye hiç gönderilmiyor; panel yalnızca
 * "dolu mu" bilgisini görüyor ve üzerine yeni değer yazabiliyor.
 */
const SECRET_KEY = /TOKEN|SECRET|KEY|PASSWORD/i;

export interface EnvEntry {
  key: string;
  /** Sır değilse gerçek değer; sırsa undefined. */
  value?: string;
  secret: boolean;
  /** Sırlar için: kayıtlı bir değer var mı. */
  hasValue: boolean;
}

function envPath(): string {
  return path.resolve(process.cwd(), ".env");
}

function parse(content: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    values.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return values;
}

export function readEnv(): EnvEntry[] {
  let content = "";
  try {
    content = fs.readFileSync(envPath(), "utf-8");
  } catch {
    return [];
  }

  return [...parse(content).entries()].map(([key, value]) => {
    const secret = SECRET_KEY.test(key);
    return {
      key,
      secret,
      hasValue: value.length > 0,
      value: secret ? undefined : value,
    };
  });
}

/**
 * Verilen anahtarları günceller; dosyadaki yorumları ve sırayı korur.
 * Boş değer gönderilen anahtar değiştirilmez — panelde maskelenmiş bir sırrı
 * boş bırakmak "silmek" değil "dokunma" anlamına geliyor.
 */
export function updateEnv(changes: Record<string, string>): void {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(envPath(), "utf-8").split("\n");
  } catch {
    // .env yoksa sıfırdan oluşturulur
  }

  const remaining = new Map(Object.entries(changes).filter(([, value]) => value.length > 0));

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return line;

    const key = trimmed.slice(0, eq).trim();
    const value = remaining.get(key);
    if (value === undefined) return line;
    remaining.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of remaining) {
    updated.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath(), updated.join("\n"));
}
