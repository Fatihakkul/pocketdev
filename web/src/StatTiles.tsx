import type { JobRecord } from "./types.js";

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}sn`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 === 0 ? `${minutes}dk` : `${minutes}dk ${seconds % 60}sn`;
}

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

interface Tile {
  label: string;
  value: string;
  hint?: string;
}

/**
 * KPI satırı: dört başlık sayısı.
 *
 * Bilinçli olarak grafik değil. Veri "birkaç başlık sayısı" olduğunda doğru
 * form stat tile; ayrıca geçmiş bu özellikle birlikte sıfırdan başlıyor, iki
 * noktalı bir grafik bilgi vermek yerine yanıltırdı.
 */
export function StatTiles({ history, active }: { history: JobRecord[]; active: JobRecord[] }) {
  const finished = history.filter((job) => job.finishedAt);
  const successful = finished.filter((job) => job.status === "success");
  const failed = finished.filter((job) => job.status === "error");

  const durations = successful
    .map((job) => (job.finishedAt ?? 0) - job.startedAt)
    .filter((ms) => ms > 0);
  const averageMs =
    durations.length > 0 ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : 0;

  const last = finished[0];

  const tiles: Tile[] = [
    {
      label: "Toplam build",
      value: String(finished.length),
      hint: active.length > 0 ? `+${active.length} çalışıyor` : undefined,
    },
    {
      label: "Başarılı",
      value: finished.length === 0 ? "—" : `%${Math.round((successful.length / finished.length) * 100)}`,
      hint: finished.length === 0 ? undefined : `${successful.length}/${finished.length}`,
    },
    {
      label: "Başarısız",
      value: String(failed.length),
      hint: failed.length > 0 ? "son loglara bak" : undefined,
    },
    {
      label: "Ortalama süre",
      value: averageMs > 0 ? formatDuration(averageMs) : "—",
      hint: last ? `son: ${relativeTime(last.startedAt)}` : undefined,
    },
  ];

  return (
    <div className="tiles">
      {tiles.map((tile) => (
        <div key={tile.label} className="tile">
          <span className="tile-label">{tile.label}</span>
          <span className="tile-value">{tile.value}</span>
          <span className="tile-hint">{tile.hint ?? " "}</span>
        </div>
      ))}
    </div>
  );
}
