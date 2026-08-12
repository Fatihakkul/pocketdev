import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";

/**
 * `resolveInside` sandbox'ın sınır bekçisi: `/ls`, `/mkdir`, `/diff` gibi
 * komutların yolları buradan geçiyor. Kaçış olursa bot proje klasörünün
 * dışını okuyup yazabilir, o yüzden testler kaçış denemelerine odaklı.
 *
 * `config.js` içe aktarılırken zorunlu ortam değişkenlerini istiyor ve yoksa
 * fırlatıyor; modül seviyesinde olduğu için testte önce env kuruluyor, sonra
 * dinamik import yapılıyor.
 */
process.env.BOT_TOKEN ??= "test-token";
process.env.ALLOWED_USER_ID ??= "1";

const { resolveInside, isValidProjectName, SandboxViolationError } = await import("../../src/core/workspace.js");

const BASE = path.resolve("/tmp/bridge-base");

describe("resolveInside", () => {
  test("klasör içindeki yolu çözer", () => {
    assert.equal(resolveInside(BASE, "src/index.ts"), path.join(BASE, "src/index.ts"));
  });

  test("temel klasörün kendisine izin verir", () => {
    assert.equal(resolveInside(BASE, "."), BASE);
  });

  test("üst klasöre çıkışı reddeder", () => {
    assert.throws(() => resolveInside(BASE, ".."), SandboxViolationError);
    assert.throws(() => resolveInside(BASE, "../../etc/passwd"), SandboxViolationError);
  });

  test("içeri girip sonra kaçan yolu reddeder", () => {
    assert.throws(() => resolveInside(BASE, "src/../../../etc/passwd"), SandboxViolationError);
  });

  test("mutlak yolla kaçışı reddeder", () => {
    assert.throws(() => resolveInside(BASE, "/etc/passwd"), SandboxViolationError);
  });

  test("aynı önekle başlayan kardeş klasörü reddeder", () => {
    // "/tmp/bridge-base-gizli" dizgesel olarak "/tmp/bridge-base" ile başlıyor;
    // ayırıcı eklenmeden yapılan karşılaştırma bunu içeride sanırdı.
    assert.throws(() => resolveInside(BASE, "../bridge-base-gizli/x"), SandboxViolationError);
  });

  test("içeri dönen dolambaçlı yola izin verir", () => {
    assert.equal(resolveInside(BASE, "src/../lib/a.ts"), path.join(BASE, "lib/a.ts"));
  });

  test("hata anlaşılır bir mesaj taşır", () => {
    assert.throws(() => resolveInside(BASE, "../x"), /escapes the allowed directory/);
  });
});

describe("isValidProjectName", () => {
  test("harf, rakam, tire ve alt çizgi kabul edilir", () => {
    assert.equal(isValidProjectName("example-expo-app"), true);
    assert.equal(isValidProjectName("Proje_2"), true);
  });

  test("yol ayırıcı ve nokta reddedilir", () => {
    assert.equal(isValidProjectName("../escape"), false);
    assert.equal(isValidProjectName("a/b"), false);
    assert.equal(isValidProjectName("a.b"), false);
  });

  test("boş ad reddedilir", () => {
    assert.equal(isValidProjectName(""), false);
  });
});
