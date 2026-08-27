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
  test("resolves a path inside the folder", () => {
    assert.equal(resolveInside(BASE, "src/index.ts"), path.join(BASE, "src/index.ts"));
  });

  test("allows the base folder itself", () => {
    assert.equal(resolveInside(BASE, "."), BASE);
  });

  test("rejects escaping to the parent folder", () => {
    assert.throws(() => resolveInside(BASE, ".."), SandboxViolationError);
    assert.throws(() => resolveInside(BASE, "../../etc/passwd"), SandboxViolationError);
  });

  test("rejects a path that enters then escapes", () => {
    assert.throws(() => resolveInside(BASE, "src/../../../etc/passwd"), SandboxViolationError);
  });

  test("rejects escaping via an absolute path", () => {
    assert.throws(() => resolveInside(BASE, "/etc/passwd"), SandboxViolationError);
  });

  test("rejects a sibling folder sharing the same prefix", () => {
    // "/tmp/bridge-base-gizli" dizgesel olarak "/tmp/bridge-base" ile başlıyor;
    // ayırıcı eklenmeden yapılan karşılaştırma bunu içeride sanırdı.
    assert.throws(() => resolveInside(BASE, "../bridge-base-gizli/x"), SandboxViolationError);
  });

  test("allows a winding path that stays inside", () => {
    assert.equal(resolveInside(BASE, "src/../lib/a.ts"), path.join(BASE, "lib/a.ts"));
  });

  test("the error carries a readable message", () => {
    assert.throws(() => resolveInside(BASE, "../x"), /escapes the allowed directory/);
  });
});

describe("isValidProjectName", () => {
  test("letters, digits, hyphen and underscore are accepted", () => {
    assert.equal(isValidProjectName("example-expo-app"), true);
    assert.equal(isValidProjectName("Proje_2"), true);
  });

  test("path separators and dots are rejected", () => {
    assert.equal(isValidProjectName("../escape"), false);
    assert.equal(isValidProjectName("a/b"), false);
    assert.equal(isValidProjectName("a.b"), false);
  });

  test("an empty name is rejected", () => {
    assert.equal(isValidProjectName(""), false);
  });
});
