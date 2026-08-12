import { useState } from "react";
import type { ProjectInfo } from "./types.js";

interface Props {
  projects: ProjectInfo[];
  activeProject?: string;
  /** Aktif projeyi değiştirmek için `/use` komutunu çalıştırır. */
  onActivate(name: string): void;
  onChanged(): void;
}

export function Projects({ projects, activeProject, onActivate, onChanged }: Props) {
  const [busy, setBusy] = useState<"pick" | "link" | undefined>();
  const [error, setError] = useState<string>();
  const [manualPath, setManualPath] = useState("");
  const [showManual, setShowManual] = useState(false);

  async function post(url: string, body?: unknown): Promise<any> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? `Sunucu ${res.status} döndü`);
    return data;
  }

  async function pickFolder() {
    setError(undefined);
    setBusy("pick");
    try {
      // Diyalog Mac'te açılıyor; kullanıcı seçene kadar bu istek bekliyor.
      const data = await post("/api/projects/pick");
      if (!data.canceled) onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function linkManually() {
    setError(undefined);
    setBusy("link");
    try {
      await post("/api/projects/link", { path: manualPath.trim() });
      setManualPath("");
      setShowManual(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function unlink(name: string) {
    setError(undefined);
    try {
      await post("/api/projects/unlink", { name });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="panel">
      <div className="projects-head">
        <p className="empty">
          Telegram'daki <code>/projects</code> listesinin aynısı. Bağlanan klasörler workspace
          projeleriyle aynı şekilde davranır — bot yeniden başlayınca kaybolurlar.
        </p>
        <div className="command-actions">
          <button className="button" disabled={busy !== undefined} onClick={() => void pickFolder()}>
            {busy === "pick" ? "Finder açık…" : "Proje ekle"}
          </button>
          <button className="link" onClick={() => setShowManual((prev) => !prev)}>
            {showManual ? "vazgeç" : "yol yaz"}
          </button>
        </div>
      </div>

      {showManual && (
        <div className="command-actions">
          <input
            className="input"
            placeholder="/Users/…/projem"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualPath.trim()) void linkManually();
            }}
          />
          <button className="button" disabled={busy !== undefined || !manualPath.trim()} onClick={() => void linkManually()}>
            bağla
          </button>
        </div>
      )}

      {error && <p className="job-error">{error}</p>}

      {projects.length === 0 ? (
        <p className="empty">Henüz proje yok. /new ile oluştur ya da bir klasör bağla.</p>
      ) : (
        <ul className="commands">
          {projects.map((project) => {
            const isActive = project.name === activeProject;
            return (
              <li key={project.name} className="command">
                <div className="command-info">
                  <span className="project-name">
                    <code>{project.name}</code>
                    {isActive && <span className="chip">aktif</span>}
                    {/* Rozet renge değil, metne dayanıyor: bağlı olmak bir durum, uyarı değil. */}
                    {project.linked && <span className="chip chip-linked">bağlı</span>}
                  </span>
                  <span className="dim project-path">{project.path}</span>
                </div>
                <div className="command-actions">
                  {!isActive && (
                    <button className="button" onClick={() => onActivate(project.name)}>
                      aktif yap
                    </button>
                  )}
                  {project.linked && (
                    <button className="link" onClick={() => void unlink(project.name)}>
                      kaldır
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
