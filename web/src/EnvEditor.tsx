import { useState } from "react";
import type { EnvEntry } from "./types.js";

export function EnvEditor({ entries, onSaved }: { entries: EnvEntry[]; onSaved(): void }) {
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>();
  const [saving, setSaving] = useState(false);

  const dirty = Object.values(changes).some((value) => value.trim().length > 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/env", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndü`);
      setChanges({});
      setStatus("Kaydedildi. Değişikliklerin etkili olması için botu yeniden başlat.");
      onSaved();
    } catch (e) {
      setStatus(`Kaydedilemedi: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2>Ortam değişkenleri</h2>
      <p className="empty">
        Sırların mevcut değeri sunucudan hiç gönderilmiyor. Boş bırakılan alan değiştirilmez —
        maskeli bir sırrı boş bırakmak onu silmez.
      </p>

      <ul className="env">
        {entries.map((entry) => (
          <li key={entry.key} className="env-row">
            <label htmlFor={`env-${entry.key}`}>
              {entry.key}
              {entry.secret && <span className="chip">sır</span>}
            </label>
            <input
              id={`env-${entry.key}`}
              className="input"
              type={entry.secret ? "password" : "text"}
              placeholder={entry.secret ? (entry.hasValue ? "•••••• (dokunma)" : "(boş)") : ""}
              value={changes[entry.key] ?? (entry.secret ? "" : entry.value ?? "")}
              onChange={(e) => setChanges((prev) => ({ ...prev, [entry.key]: e.target.value }))}
            />
          </li>
        ))}
      </ul>

      <div className="env-actions">
        <button className="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "kaydediliyor…" : "kaydet"}
        </button>
        {status && <span className="dim">{status}</span>}
      </div>
    </section>
  );
}
