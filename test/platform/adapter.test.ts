import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { detectProjectKind, ensureSupported, getAdapter } from "../../src/platform/adapter.js";

let projectPath: string;

function write(relativePath: string, contents: string): void {
  const target = path.join(projectPath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-"));
});

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true });
});

describe("detectProjectKind", () => {
  test("package.json'da expo bağımlılığı varsa expo", () => {
    write("package.json", `{"dependencies":{"expo":"~54.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("devDependencies'teki expo de sayılır", () => {
    write("package.json", `{"devDependencies":{"expo":"~54.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("bağımlılık yoksa app.json'daki expo anahtarı yeter", () => {
    write("package.json", `{"dependencies":{}}`);
    write("app.json", `{"expo":{"name":"x"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("ios/Podfile + react-native varsa react-native-cli", () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    assert.equal(detectProjectKind(projectPath), "react-native-cli");
  });

  test("Expo, RN CLI'dan önce gelir — Expo projesinde de Podfile bulunur", () => {
    write("package.json", `{"dependencies":{"expo":"~54.0.0","react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("Podfile'sız react-native tanınmaz — prebuild edilmemiş olabilir", () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    assert.equal(detectProjectKind(projectPath), undefined);
  });

  test("mobil olmayan klasör tanınmaz", () => {
    write("package.json", `{"dependencies":{"express":"4.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), undefined);
  });

  test("boş klasör ve bozuk package.json çökmez", () => {
    assert.equal(detectProjectKind(projectPath), undefined);
    write("package.json", "bu json değil");
    assert.equal(detectProjectKind(projectPath), undefined);
  });

  test("sonuç önbelleğe alınmaz — bağımlılık sonradan eklenebilir", () => {
    write("package.json", `{"dependencies":{}}`);
    assert.equal(detectProjectKind(projectPath), undefined);

    write("package.json", `{"dependencies":{"expo":"~54.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });
});

describe("getAdapter", () => {
  test("Expo projesinde expo adapter'ı döner", async () => {
    write("package.json", `{"dependencies":{"expo":"~54.0.0"}}`);
    const adapter = await getAdapter(projectPath);
    assert.equal(adapter.kind, "expo");
    assert.equal(adapter.supports("qabuild"), true);
  });

  test("RN CLI projesinde rn adapter'ı döner ve /qabuild kapalıdır", async () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    const adapter = await getAdapter(projectPath);
    assert.equal(adapter.kind, "react-native-cli");
    // /qabuild EAS'e ve app.json'daki Expo alanlarına bağlı.
    assert.equal(adapter.supports("qabuild"), false);
    assert.equal(adapter.supports("otabuild"), true);
    assert.equal(adapter.supports("localbuild"), true);
  });

  test("ensureSupported desteklenmeyen komutu proje tipiyle birlikte reddeder", async () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    await assert.rejects(
      ensureSupported(projectPath, "qabuild"),
      /\/qabuild bu proje tipinde \(react-native-cli\) desteklenmiyor/
    );
  });

  test("tanınmayan klasörde iOS komutlarının kapalı olduğunu söyler", async () => {
    await assert.rejects(getAdapter(projectPath), /tanınan bir mobil proje değil/);
  });
});
