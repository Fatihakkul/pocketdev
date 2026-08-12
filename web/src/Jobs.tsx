import type { JobRecord } from "./types.js";
import { StatusBadge } from "./Status.js";

function durationMs(job: JobRecord): number {
  return (job.finishedAt ?? Date.now()) - job.startedAt;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}sn`;
  return `${Math.floor(seconds / 60)}dk ${seconds % 60}sn`;
}

function when(timestamp: number): string {
  return new Date(timestamp).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunningJobs({ jobs }: { jobs: JobRecord[] }) {
  if (jobs.length === 0) {
    return (
      <section className="panel">
        <h2>Çalışan işler</h2>
        <p className="empty">Şu an çalışan bir iş yok.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Çalışan işler</h2>
      <ul className="running">
        {jobs.map((job) => (
          <li key={job.id} className="running-item">
            <div className="running-head">
              <StatusBadge status={job.status} />
              <strong>{job.kind}</strong>
              {job.label && <span className="chip">{job.label}</span>}
              <span className="dim">{job.project}</span>
              <span className="dim running-elapsed">{formatDuration(durationMs(job))}</span>
            </div>
            {job.lastLine && <p className="running-line">{job.lastLine}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Geçmiş tablosu. Süre sütunu tek hue'lu (sequential) bir çubuk taşıyor —
 * işi büyüklük karşılaştırması, kimlik değil, o yüzden kategorik renk yok.
 * Çubuk en uzun build'e göre ölçekleniyor.
 */
export function BuildHistory({ jobs }: { jobs: JobRecord[] }) {
  if (jobs.length === 0) {
    return (
      <section className="panel">
        <h2>Geçmiş build'ler</h2>
        <p className="empty">
          Henüz kayıt yok. Geçmiş bu özellikle birlikte başlıyor — daha önceki build'ler
          hiçbir yere kaydedilmiyordu.
        </p>
      </section>
    );
  }

  const longest = Math.max(...jobs.map(durationMs), 1);

  return (
    <section className="panel">
      <h2>Geçmiş build'ler</h2>
      <table className="history">
        <thead>
          <tr>
            <th>Durum</th>
            <th>İş</th>
            <th>Proje</th>
            <th>Başlangıç</th>
            <th className="col-duration">Süre</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <StatusBadge status={job.status} />
              </td>
              <td>
                <span className="job-kind">{job.kind}</span>
                {job.label && <span className="chip">{job.label}</span>}
                {job.detail && <span className="job-detail">{job.detail}</span>}
                {job.error && <span className="job-error">{job.error}</span>}
                {job.status === "error" && job.logPath && (
                  <span className="job-log">tam log: {job.logPath}</span>
                )}
              </td>
              <td className="dim col-tight">{job.project}</td>
              <td className="dim nums col-tight">{when(job.startedAt)}</td>
              <td className="col-duration">
                <div className="bar-cell">
                  <span className="nums">{formatDuration(durationMs(job))}</span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${Math.max(4, (durationMs(job) / longest) * 100)}%` }}
                    />
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
