import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

/**
 * Uzun süren işlerin (build, önizleme, kayıt) tek kaydı.
 *
 * Hem "şu an ne çalışıyor" hem "geçmişte ne oldu" sorularını aynı yerden
 * cevaplıyor. Daha önce ikisi de yoktu: her runner kendi `isBuilding`
 * bayrağını ayrı tutuyordu ve biten build hiçbir yere yazılmıyordu, sonuç
 * yalnızca Telegram mesajı olarak kalıyordu.
 */
export type JobStatus = "running" | "success" | "error";

export interface JobRecord {
  id: string;
  kind: string;
  /** Ayırt edici kısa etiket: "Debug", cihaz adı, profil adı… */
  label?: string;
  project: string;
  channel: string;
  startedAt: number;
  finishedAt?: number;
  status: JobStatus;
  /** Başarı çıktısı: kurulum linki, cihaz adı, build sayfası… */
  detail?: string;
  error?: string;
  /** Son ilerleme satırı; panel canlı durumu bununla gösteriyor. */
  lastLine?: string;
  /** Varsa tam log dosyasının yolu. */
  logPath?: string;
}

export interface Job {
  id: string;
  progress(line: string): void;
  succeed(detail?: string): void;
  fail(error: string): void;
}

const HISTORY_LIMIT = 200;

const active = new Map<string, JobRecord>();

function historyFile(): string {
  return path.join(path.dirname(config.stateFile), "builds.jsonl");
}

/**
 * Geçmiş JSONL olarak tutuluyor: her satır bağımsız bir kayıt.
 * `state.json`'daki oku-değiştir-yaz döngüsünün aksine, eşzamanlı biten iki
 * işten biri diğerini ezemiyor.
 */
function appendHistory(record: JobRecord): void {
  try {
    fs.mkdirSync(path.dirname(historyFile()), { recursive: true });
    fs.appendFileSync(historyFile(), JSON.stringify(record) + "\n");
  } catch {
    // Geçmiş kaydı yan işlev; yazılamaması işi başarısız saymamalı.
  }
}

export function startJob(input: {
  kind: string;
  project: string;
  channel: string;
  label?: string;
  logPath?: string;
}): Job {
  const record: JobRecord = {
    id: randomUUID(),
    kind: input.kind,
    label: input.label,
    project: input.project,
    channel: input.channel,
    logPath: input.logPath,
    startedAt: Date.now(),
    status: "running",
  };
  active.set(record.id, record);

  const finish = (status: JobStatus, fields: Partial<JobRecord>): void => {
    if (!active.has(record.id)) return;
    active.delete(record.id);
    appendHistory({ ...record, ...fields, status, finishedAt: Date.now() });
  };

  return {
    id: record.id,
    progress: (line) => {
      record.lastLine = line;
    },
    succeed: (detail) => finish("success", { detail }),
    fail: (error) => finish("error", { error }),
  };
}

export function activeJobs(): JobRecord[] {
  return [...active.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function history(limit = 50): JobRecord[] {
  let lines: string[];
  try {
    lines = fs.readFileSync(historyFile(), "utf-8").split("\n").filter(Boolean);
  } catch {
    return [];
  }

  const records: JobRecord[] = [];
  for (const line of lines.slice(-HISTORY_LIMIT)) {
    try {
      records.push(JSON.parse(line) as JobRecord);
    } catch {
      // Bozuk satırı atla; tek satırın bozulması tüm geçmişi düşürmemeli.
    }
  }
  return records.reverse().slice(0, limit);
}
