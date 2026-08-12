import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  EXPO_INPUTS,
  nativeInputsHash,
  needsSync,
  RN_CLI_INPUTS,
  writeStamp,
} from "../../src/platform/nativeSync.js";

/**
 * Bu karar yanlış olduğunda build yeşil geçip cihazda patlıyor (eksik native
 * modül), yani en pahalıya mal olan hata sınıfı burada.
 */

let projectPath: string;

function write(relativePath: string, contents: string): void {
  const target = path.join(projectPath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "native-sync-"));
});

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true });
});

describe("nativeInputsHash", () => {
  test("package.json değişince özet değişir", () => {
    write("package.json", `{"dependencies":{}}`);
    const before = nativeInputsHash(projectPath, EXPO_INPUTS);

    write("package.json", `{"dependencies":{"react-native-google-mobile-ads":"1.0.0"}}`);
    assert.notEqual(nativeInputsHash(projectPath, EXPO_INPUTS), before);
  });

  test("app.json değişince de özet değişir (config plugin eklenebilir)", () => {
    write("package.json", `{}`);
    write("app.json", `{"expo":{"plugins":[]}}`);
    const before = nativeInputsHash(projectPath, EXPO_INPUTS);

    write("app.json", `{"expo":{"plugins":["expo-notifications"]}}`);
    assert.notEqual(nativeInputsHash(projectPath, EXPO_INPUTS), before);
  });

  test("dosyanın yokluğu da özetin parçası", () => {
    write("package.json", `{}`);
    const withoutAppJson = nativeInputsHash(projectPath, EXPO_INPUTS);

    write("app.json", `{}`);
    assert.notEqual(nativeInputsHash(projectPath, EXPO_INPUTS), withoutAppJson);
  });
});

describe("needsSync", () => {
  test("ios/ klasörü hiç yoksa eşitleme gerekir", () => {
    write("package.json", `{}`);
    assert.equal(needsSync(projectPath, EXPO_INPUTS), true);
  });

  test("damga güncelken eşitleme gerekmez", () => {
    write("package.json", `{}`);
    write("ios/Podfile.lock", "PODS:");
    writeStamp(projectPath, EXPO_INPUTS);

    assert.equal(needsSync(projectPath, EXPO_INPUTS), false);
  });

  test("damgadan sonra bağımlılık eklenirse eşitleme gerekir", () => {
    write("package.json", `{"dependencies":{}}`);
    write("ios/Podfile.lock", "PODS:");
    writeStamp(projectPath, EXPO_INPUTS);

    write("package.json", `{"dependencies":{"react-native-google-mobile-ads":"1.0.0"}}`);
    assert.equal(needsSync(projectPath, EXPO_INPUTS), true);
  });

  test("damga bozuksa (okunamıyorsa) Podfile.lock tarihine düşer", () => {
    write("package.json", `{}`);
    write("ios/Podfile.lock", "PODS:");
    write("build/prebuild-stamp.json", "bu json değil");

    // package.json, Podfile.lock'tan eski olmadığı sürece bayat sayılmaz;
    // burada ikisi de aynı anda yazıldığı için karar "gerek yok" olmalı.
    assert.equal(needsSync(projectPath, EXPO_INPUTS), false);
  });

  test("damga yokken Podfile.lock'tan yeni package.json bayat sayılır", () => {
    write("ios/Podfile.lock", "PODS:");
    const past = Date.now() - 60_000;
    fs.utimesSync(path.join(projectPath, "ios/Podfile.lock"), past / 1000, past / 1000);
    write("package.json", `{"dependencies":{"yeni-paket":"1.0.0"}}`);

    assert.equal(needsSync(projectPath, EXPO_INPUTS), true);
  });

  test("damga yokken Podfile.lock yoksa eşitleme gerekir", () => {
    write("package.json", `{}`);
    fs.mkdirSync(path.join(projectPath, "ios"), { recursive: true });

    assert.equal(needsSync(projectPath, EXPO_INPUTS), true);
  });
});

describe("girdi listesi proje tipine göre değişir", () => {
  test("RN CLI'da ios/Podfile girdi, app.json değil", () => {
    write("package.json", `{}`);
    write("app.json", `{"name":"x"}`);
    write("ios/Podfile", "platform :ios, '15.1'");
    const before = nativeInputsHash(projectPath, RN_CLI_INPUTS);

    // RN CLI'da app.json yalnızca uygulama adını taşıyor, native tarafa yansımaz.
    write("app.json", `{"name":"başka"}`);
    assert.equal(nativeInputsHash(projectPath, RN_CLI_INPUTS), before);

    // Podfile ise doğrudan `pod install`'ın girdisi.
    write("ios/Podfile", "platform :ios, '16.0'");
    assert.notEqual(nativeInputsHash(projectPath, RN_CLI_INPUTS), before);
  });

  test("Podfile'a pod eklenince RN CLI'da eşitleme gerekir", () => {
    write("package.json", `{}`);
    write("ios/Podfile", "platform :ios");
    write("ios/Podfile.lock", "PODS:");
    writeStamp(projectPath, RN_CLI_INPUTS);
    assert.equal(needsSync(projectPath, RN_CLI_INPUTS), false);

    write("ios/Podfile", "platform :ios\npod 'Firebase'");
    assert.equal(needsSync(projectPath, RN_CLI_INPUTS), true);
  });

  test("damga tek dosya — iki liste aynı damgayı paylaşır ve tip değişirse bayat sayılır", () => {
    // Bir projenin tipi değişirse (ör. Expo'ya geçiş) damga eşleşmez ve bir kez
    // fazladan eşitleme olur. Doğru taraf bu: az eşitleme, eksik native modül
    // demek; fazla eşitleme yalnızca zaman kaybı.
    write("package.json", `{}`);
    write("app.json", `{"expo":{}}`);
    write("ios/Podfile", "platform :ios");
    write("ios/Podfile.lock", "PODS:");

    writeStamp(projectPath, RN_CLI_INPUTS);
    assert.equal(needsSync(projectPath, EXPO_INPUTS), true);
  });
});

describe("writeStamp", () => {
  test("damga eşitleme sonrası değişen girdileri yakalar", () => {
    // Gerçek senaryo: prebuild eksik bağımlılığı package.json'a kendisi yazıyor.
    // Damga prebuild BİTTİKTEN sonra alındığı için bir sonraki build gereksiz
    // yere yeniden eşitlememeli.
    write("package.json", `{"dependencies":{}}`);
    write("ios/Podfile.lock", "PODS:");

    write("package.json", `{"dependencies":{"expo-dev-client":"1.0.0"}}`);
    writeStamp(projectPath, EXPO_INPUTS);

    assert.equal(needsSync(projectPath, EXPO_INPUTS), false);
  });
});
