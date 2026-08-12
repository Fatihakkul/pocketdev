import type { JobRecord } from "./types.js";

/**
 * Durum rozeti: ikon + metin + renk.
 *
 * İkon ve metin süs değil, erişilebilirlik gereği. Doğrulayıcı ölçtü:
 * "başarılı" yeşili ile "hata" kırmızısı deuteranopi altında ΔE 4.1 — yani
 * kırmızı-yeşil renk körlüğü olan biri ikisini renkten ayırt edemiyor.
 * Anlamı taşıyan şey glif ve etiket; renk yalnızca hızlı tarama için.
 */
const STATUS: Record<JobRecord["status"], { glyph: string; label: string }> = {
  running: { glyph: "◐", label: "çalışıyor" },
  success: { glyph: "✓", label: "başarılı" },
  error: { glyph: "✕", label: "hata" },
};

export function StatusBadge({ status }: { status: JobRecord["status"] }) {
  const { glyph, label } = STATUS[status];
  return (
    <span className={`status status-${status}`}>
      <span className="status-glyph" aria-hidden="true">
        {glyph}
      </span>
      {label}
    </span>
  );
}
