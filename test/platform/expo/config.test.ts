import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  clearExpoConfigCache,
  EXPO_CONFIG_FILES,
  EXPO_SPECIFIC_CONFIG_FILES,
  expoNativeInputsHash,
  hasDynamicConfig,
  readExpoConfig,
} from "../../../src/platform/expo/config.js";
import { m } from "../../../src/i18n/index.js";

/**
 * `app.json` Expo'nun dört config olasılığından yalnızca biri. Bu yanlış
 * olduğunda ya komut hiç çalışmıyor ya da — daha kötüsü — override edilmiş
 * bir bundleId sessizce eski değeriyle okunup yanlış imzalama profili seçiliyor.
 */

let projectPath: string;

function write(relativePath: string, contents: string): void {
  const target = path.join(projectPath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

/**
 * Sahte proje-yerel Expo CLI'si. Gerçek `expo config --json` gibi stdout'a
 * çözümlenmiş config'i basar, böylece testler expo kurmadan CLI yolunu
 * gerçekten çalıştırabiliyor.
 */
function fakeExpoBin(resolved: unknown): void {
  const bin = path.join(projectPath, "node_modules", ".bin", "expo");
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify(resolved)}\nJSON\n`);
  fs.chmodSync(bin, 0o755);
}

/** Çıkışı sıfırdan farklı olan CLI — bozuk app.config.js'i taklit ediyor. */
function failingExpoBin(): void {
  const bin = path.join(projectPath, "node_modules", ".bin", "expo");
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, `#!/bin/sh\necho "boom" >&2\nexit 1\n`);
  fs.chmodSync(bin, 0o755);
}

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "expo-config-"));
  clearExpoConfigCache();
});

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true });
});

describe("readExpoConfig — statik yol", () => {
  test("app.json okunur (bugünkü davranışın regresyon koruması)", async () => {
    write("app.json", `{"expo":{"name":"Renkler","ios":{"bundleIdentifier":"com.renkler.app"}}}`);
    const config = await readExpoConfig(projectPath);
    assert.equal(config.name, "Renkler");
    assert.equal(config.ios.bundleIdentifier, "com.renkler.app");
  });

  test("app.config.json de okunur", async () => {
    write("app.config.json", `{"expo":{"name":"Cfg","ios":{"bundleIdentifier":"com.cfg.app"}}}`);
    const config = await readExpoConfig(projectPath);
    assert.equal(config.ios.bundleIdentifier, "com.cfg.app");
  });

  test("app.config.json, app.json'dan önce gelir — Expo'nun sırası", async () => {
    write("app.json", `{"expo":{"name":"Eski"}}`);
    write("app.config.json", `{"expo":{"name":"Yeni"}}`);
    assert.equal((await readExpoConfig(projectPath)).name, "Yeni");
  });

  test("expo anahtarı olmayan düz JSON da kabul edilir", async () => {
    write("app.json", `{"name":"Duz","ios":{"bundleIdentifier":"com.duz.app"}}`);
    assert.equal((await readExpoConfig(projectPath)).ios.bundleIdentifier, "com.duz.app");
  });
});

describe("readExpoConfig — CLI yolu", () => {
  test("expo binary varsa çözümlenmiş config kullanılır", async () => {
    fakeExpoBin({ name: "Cozumlenmis", ios: { bundleIdentifier: "com.cli.app" } });
    const config = await readExpoConfig(projectPath);
    assert.equal(config.ios.bundleIdentifier, "com.cli.app");
  });

  test("dinamik config app.json'ı EZER — sessizce yanlış okuma buradan geliyordu", async () => {
    // Statik dosya eski değeri taşıyor, app.config.js üzerine yazıyor.
    write("app.json", `{"expo":{"ios":{"bundleIdentifier":"com.eski.app"}}}`);
    write("app.config.js", `module.exports = { expo: { ios: { bundleIdentifier: "com.yeni.app" } } };`);
    fakeExpoBin({ ios: { bundleIdentifier: "com.yeni.app" } });

    const config = await readExpoConfig(projectPath);
    assert.equal(config.ios.bundleIdentifier, "com.yeni.app");
  });

  test("app.json hiç yokken app.config.js'li proje çalışır", async () => {
    write("app.config.ts", `export default { expo: { name: "Dinamik" } };`);
    fakeExpoBin({ name: "Dinamik", ios: { bundleIdentifier: "com.dinamik.app" } });
    assert.equal((await readExpoConfig(projectPath)).ios.bundleIdentifier, "com.dinamik.app");
  });

  test("CLI patlarsa statik okumaya düşer", async () => {
    write("app.json", `{"expo":{"name":"Yedek"}}`);
    failingExpoBin();
    assert.equal((await readExpoConfig(projectPath)).name, "Yedek");
  });
});

describe("readExpoConfig — hatalar", () => {
  test("hiç config yoksa net hata", async () => {
    await assert.rejects(readExpoConfig(projectPath), (error: Error) => {
      assert.equal(error.message, m().runtime.expoConfigMissing);
      return true;
    });
  });

  test("dinamik config var ama değerlendirilemiyorsa npm install önerilir", async () => {
    // Binary yok: app.config.js çalıştırılamaz ve okunacak statik dosya da yok.
    write("app.config.js", `module.exports = { expo: {} };`);
    await assert.rejects(readExpoConfig(projectPath), (error: Error) => {
      assert.equal(error.message, m().runtime.expoConfigNeedsInstall);
      return true;
    });
  });
});

describe("readExpoConfig — önbellek", () => {
  test("config dosyası değişince yeniden okunur", async () => {
    write("app.json", `{"expo":{"name":"Once"}}`);
    assert.equal((await readExpoConfig(projectPath)).name, "Once");

    // mtime çözünürlüğü aynı milisaniyeye denk gelmesin.
    const appJson = path.join(projectPath, "app.json");
    fs.writeFileSync(appJson, `{"expo":{"name":"Sonra"}}`);
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(appJson, future, future);

    assert.equal((await readExpoConfig(projectPath)).name, "Sonra");
  });
});

describe("EXPO_SPECIFIC_CONFIG_FILES", () => {
  test("app.json dışarıda — RN CLI projelerinde de var", () => {
    assert.equal(EXPO_SPECIFIC_CONFIG_FILES.includes("app.json"), false);
    assert.equal(EXPO_CONFIG_FILES.includes("app.json"), true);
  });

  test("dinamik uzantıların hepsi tanınır", () => {
    for (const ext of [".ts", ".mts", ".cts", ".mjs", ".cjs", ".js"]) {
      assert.equal(EXPO_SPECIFIC_CONFIG_FILES.includes(`app.config${ext}`), true, ext);
    }
  });

  test("hasDynamicConfig yalnızca JS/TS config'i sayar", () => {
    write("app.json", `{"expo":{}}`);
    assert.equal(hasDynamicConfig(projectPath), false);
    write("app.config.js", `module.exports = {};`);
    assert.equal(hasDynamicConfig(projectPath), true);
  });
});

describe("expoNativeInputsHash", () => {
  test("plugin listesi app.config.js içinde değişince özet değişir", async () => {
    write("package.json", `{"dependencies":{"expo":"~57.0.0"}}`);
    write("app.config.js", `module.exports = { expo: { plugins: [] } };`);
    fakeExpoBin({ plugins: [] });
    const before = await expoNativeInputsHash(projectPath);

    clearExpoConfigCache();
    fakeExpoBin({ plugins: ["expo-notifications"] });
    const after = await expoNativeInputsHash(projectPath);

    assert.notEqual(after, before);
  });

  test("dosya içeriği aynı kalsa da çözümlenmiş çıktı değişirse yakalanır", async () => {
    // Dinamik config plugin listesini .env'den üretiyor olabilir: app.config.js
    // hiç değişmeden native taraf değişir. Dosya hash'i bunu kaçırır.
    write("package.json", `{"dependencies":{"expo":"~57.0.0"}}`);
    write("app.config.js", `module.exports = () => ({ expo: { plugins: process.env.PLUGINS?.split(",") ?? [] } });`);

    fakeExpoBin({ plugins: [] });
    const before = await expoNativeInputsHash(projectPath);

    clearExpoConfigCache();
    fakeExpoBin({ plugins: ["expo-camera"] });
    const after = await expoNativeInputsHash(projectPath);

    assert.notEqual(after, before);
  });

  test("package.json değişince de özet değişir", async () => {
    write("package.json", `{"dependencies":{"expo":"~57.0.0"}}`);
    fakeExpoBin({ name: "x" });
    const before = await expoNativeInputsHash(projectPath);

    clearExpoConfigCache();
    write("package.json", `{"dependencies":{"expo":"~57.0.0","expo-camera":"~14.0.0"}}`);
    const after = await expoNativeInputsHash(projectPath);

    assert.notEqual(after, before);
  });
});
