import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDoctorReport, type CheckResult } from "../../src/workflows/doctor.js";
import { m } from "../../src/i18n/index.js";

/**
 * Beklentiler sabit metne değil sözlüğe bakıyor: aksi halde bu testler yalnızca
 * varsayılan dilde geçer ve `LOCALE=tr` ile koşulduğunda dilin kendisi yüzünden
 * kırmızıya döner.
 */

const ok = (name: string): CheckResult => ({ name, status: "ok", detail: "hazır" });

describe("formatDoctorReport", () => {
  test("her şey yolundaysa tek cümlelik özet veriyor", () => {
    const report = formatDoctorReport([ok("Xcode"), ok("Tunnel")]);
    assert.ok(report.includes(m().doctor.allGood));
    assert.ok(!report.includes(m().doctor.countMissing(1)));
  });

  test("eksik ve uyarı ayrı ayrı sayılıyor", () => {
    const report = formatDoctorReport([
      ok("Xcode"),
      { name: "Tunnel", status: "fail", detail: "kullanılamıyor", fix: "Funnel'ı aç" },
      { name: "CocoaPods", status: "warn", detail: "bulunamadı", fix: "brew install cocoapods" },
    ]);
    assert.ok(report.includes(`${m().doctor.countMissing(1)}, ${m().doctor.countWarnings(1)}`));
  });

  test("çözüm yalnızca sorunlu kontroller için gösteriliyor", () => {
    // "ok" bir kontrolün fix'i varsa bile gösterilmemeli; rapor uzadıkça
    // okunmuyor ve bu komutun bütün amacı hızlı okunabilmek.
    const report = formatDoctorReport([
      { name: "Xcode", status: "ok", detail: "16.0", fix: "gösterilmemeli" },
      { name: "Tunnel", status: "fail", detail: "yok", fix: "gösterilmeli" },
    ]);
    assert.doesNotMatch(report, /gösterilmemeli/);
    assert.match(report, /gösterilmeli/);
  });

  test("çok satırlı çözüm hizalanıyor", () => {
    const report = formatDoctorReport([
      { name: "Tunnel", status: "fail", detail: "yok", fix: "birinci satır\nikinci satır" },
    ]);
    assert.match(report, /\n {3}birinci satır\n {3}ikinci satır/);
  });

  test("proje adı verilirse başlıkta görünüyor", () => {
    assert.ok(formatDoctorReport([ok("Xcode")], "example-rn-app").includes("example-rn-app"));
  });

  test("proje adı yoksa başlık sade kalıyor", () => {
    const report = formatDoctorReport([ok("Xcode")]);
    assert.ok(report.startsWith(m().doctor.scope));
    assert.ok(!report.includes("example-rn-app"));
  });
});
