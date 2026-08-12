import { useCallback, useEffect, useState } from "react";
import type { CommandResult, PanelState } from "./types.js";
import { BuildHistory, RunningJobs } from "./Jobs.js";
import { StatTiles } from "./StatTiles.js";
import { Commands } from "./Commands.js";
import { EnvEditor } from "./EnvEditor.js";
import { Projects } from "./Projects.js";

/** Süren iş varken daha sık, boştayken daha seyrek yokluyoruz. */
const POLL_BUSY_MS = 2000;
const POLL_IDLE_MS = 8000;

type View = "overview" | "projects" | "commands" | "settings";

const NAV: Array<{ id: View; label: string }> = [
  { id: "overview", label: "Genel bakış" },
  { id: "projects", label: "Projeler" },
  { id: "commands", label: "Komutlar" },
  { id: "settings", label: "Ayarlar" },
];

export function App() {
  const [state, setState] = useState<PanelState | null>(null);
  const [error, setError] = useState<string>();
  const [view, setView] = useState<View>("overview");
  const [result, setResult] = useState<{ command: string; result: CommandResult } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`);
      setState((await res.json()) as PanelState);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = (state?.activeJobs.length ?? 0) > 0 || (state?.running.length ?? 0) > 0;

  useEffect(() => {
    const timer = setInterval(() => void load(), busy ? POLL_BUSY_MS : POLL_IDLE_MS);
    return () => clearInterval(timer);
  }, [busy, load]);

  const runCommand = useCallback(
    async (name: string, args: string[]) => {
      setResult(null);
      try {
        const res = await fetch(`/api/commands/${encodeURIComponent(name)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ args }),
        });
        setResult({ command: name, result: (await res.json()) as CommandResult });
      } catch (e) {
        setResult({ command: name, result: { error: (e as Error).message } });
      }
      void load();
    },
    [load]
  );

  if (!state) {
    return (
      <div className="boot">
        <p className="empty">{error ? `Bağlanılamadı: ${error}` : "Yükleniyor…"}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span>Bridge</span>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item${view === item.id ? " nav-item-active" : ""}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="dim">Aktif proje</span>
          <strong>{state.activeProject ?? "—"}</strong>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{NAV.find((item) => item.id === view)?.label}</h1>
          <span className={`live${busy ? " live-busy" : ""}`}>
            <span className="live-dot" aria-hidden="true" />
            {busy ? "iş çalışıyor" : "boşta"}
          </span>
        </header>

        {error && <p className="banner">Durum alınamadı: {error}</p>}

        {view === "overview" && (
          <>
            <StatTiles history={state.history} active={state.activeJobs} />
            <RunningJobs jobs={state.activeJobs} />
            <BuildHistory jobs={state.history} />
          </>
        )}

        {view === "projects" && (
          <Projects
            projects={state.projects}
            activeProject={state.activeProject}
            onActivate={(name) => void runCommand("use", [name])}
            onChanged={load}
          />
        )}

        {view === "commands" && (
          <Commands
            commands={state.commands}
            running={state.running}
            activeJobKinds={state.activeJobs.map((job) => job.kind)}
            onRun={runCommand}
            result={result}
            onDismiss={() => setResult(null)}
          />
        )}

        {view === "settings" && <EnvEditor entries={state.env} onSaved={load} />}
      </main>
    </div>
  );
}
