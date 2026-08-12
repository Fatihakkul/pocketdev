import { useState } from "react";
import type { CommandInfo, CommandResult } from "./types.js";

interface Props {
  commands: CommandInfo[];
  running: string[];
  /** Telegram'dan başlatılmış olanlar dahil, o an süren işler. */
  activeJobKinds: string[];
  onRun(name: string, args: string[]): void;
  result: { command: string; result: CommandResult } | null;
  onDismiss(): void;
}

export function Commands({ commands, running, activeJobKinds, onRun, result, onDismiss }: Props) {
  const [args, setArgs] = useState<Record<string, string>>({});

  // Telegram'dan başlatılan işler de sayılıyor: runner'ların kendi kilidi
  // konuşma kimliğine bakıyor, panel ile Telegram farklı kimlik kullandığı için
  // yalnızca web tarafına bakmak aynı projede ikinci bir archive'ı engellemezdi
  // (ikisi de build/app.xcarchive'a yazar).
  const busy = running.length > 0 || activeJobKinds.length > 0;

  return (
    <section className="panel">
      <p className="empty">
        Telegram'daki komutların aynısı — ikisi de aynı kayıt defterinden besleniyor.
        {busy && " Süren bir iş varken tetikleme kapalı."}
      </p>

      <ul className="commands">
        {commands.map((command) => {
          const isRunning = running.includes(command.name);
          return (
            <li key={command.name} className="command">
              <div className="command-info">
                <code>/{command.name}</code>
                <span className="dim">{command.description}</span>
              </div>
              <div className="command-actions">
                {command.usage && (
                  <input
                    className="input"
                    placeholder={command.usage}
                    value={args[command.name] ?? ""}
                    onChange={(e) => setArgs((prev) => ({ ...prev, [command.name]: e.target.value }))}
                  />
                )}
                <button
                  className="button"
                  // Süren bir komut varken hepsi kilitleniyor: aynı projede
                  // ikinci bir build başlatmak runner'ları çakıştırır.
                  disabled={busy}
                  onClick={() => onRun(command.name, (args[command.name] ?? "").trim().split(/\s+/).filter(Boolean))}
                >
                  {isRunning ? "çalışıyor…" : "çalıştır"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {result && (
        <div className="result">
          <div className="result-head">
            <strong>/{result.command}</strong>
            <button className="link" onClick={onDismiss}>
              kapat
            </button>
          </div>
          {result.result.error && <p className="job-error">{result.result.error}</p>}
          {result.result.messages?.map((message, i) => (
            <pre key={i} className="result-message">
              {message}
            </pre>
          ))}
          {result.result.attachments?.map((attachment, i) => (
            <p key={i} className="empty">
              [{attachment}] — panelde gösterilmiyor, Telegram'a bak
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
