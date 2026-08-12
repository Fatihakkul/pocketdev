import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  findAppIcon,
  parseBuildSettings,
  podInstallCommand,
} from "../../../src/platform/react-native-cli/adapter.js";
import { buildModeFlag } from "../../../src/platform/react-native-cli/cli.js";
import { m } from "../../../src/i18n/index.js";

let projectPath: string;

function write(relativePath: string, contents: string): void {
  const target = path.join(projectPath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "rn-cli-"));
});

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true });
});

describe("parseBuildSettings", () => {
  const entry = (buildSettings: Record<string, string>): string => JSON.stringify([{ buildSettings }]);

  test("bundle id, isim ve sürümü okur", () => {
    const info = parseBuildSettings(
      entry({
        PRODUCT_BUNDLE_IDENTIFIER: "com.ornek.app",
        PRODUCT_NAME: "Ornek",
        MARKETING_VERSION: "2.1.0",
        ASSETCATALOG_COMPILER_APPICON_NAME: "AppIcon",
      }),
      "yedek"
    );
    assert.deepEqual(info, {
      bundleId: "com.ornek.app",
      appName: "Ornek",
      version: "2.1.0",
      appIconName: "AppIcon",
    });
  });

  test("bundle id taşıyan ilk hedefi seçer — baştaki ayarsız hedefi atlar", () => {
    const stdout = JSON.stringify([
      { target: "Pods-Ornek", buildSettings: { PRODUCT_NAME: "Pods" } },
      { target: "Ornek", buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: "com.ornek.app" } },
    ]);
    assert.equal(parseBuildSettings(stdout, "yedek").bundleId, "com.ornek.app");
  });

  test("PRODUCT_NAME yoksa klasör adına düşer, sürüm yoksa '?'", () => {
    const info = parseBuildSettings(entry({ PRODUCT_BUNDLE_IDENTIFIER: "com.ornek.app" }), "yedek");
    assert.equal(info.appName, "yedek");
    assert.equal(info.version, "?");
    assert.equal(info.appIconName, "AppIcon");
  });

  test("bundle id hiç yoksa imzalama profilinin seçilemeyeceğini söyler", () => {
    assert.throws(
      () => parseBuildSettings(entry({ PRODUCT_NAME: "Ornek" }), "yedek"),
      /PRODUCT_BUNDLE_IDENTIFIER/
    );
  });

  test("JSON değilse anlaşılır hata verir", () => {
    assert.throws(() => parseBuildSettings("** BUILD FAILED **", "yedek"), (error: Error) => {
      assert.equal(error.message, m().runtime.buildSettingsUnreadable);
      return true;
    });
  });
});

describe("findAppIcon", () => {
  test("appiconset içindeki en büyük png'yi seçer", () => {
    write("ios/Ornek/Images.xcassets/AppIcon.appiconset/20.png", "x".repeat(100));
    write("ios/Ornek/Images.xcassets/AppIcon.appiconset/1024.png", "x".repeat(5000));
    write("ios/Ornek/Images.xcassets/AppIcon.appiconset/Contents.json", "{}");

    assert.equal(
      findAppIcon(path.join(projectPath, "ios"), "AppIcon"),
      path.join(projectPath, "ios/Ornek/Images.xcassets/AppIcon.appiconset/1024.png")
    );
  });

  test("özel ikon adını kullanır", () => {
    write("ios/Ornek/Images.xcassets/AppIcon.appiconset/1024.png", "x");
    write("ios/Ornek/Images.xcassets/DevIcon.appiconset/1024.png", "y");

    const found = findAppIcon(path.join(projectPath, "ios"), "DevIcon");
    assert.match(found, /DevIcon\.appiconset/);
  });

  test("ikon yoksa boş dizge — kurulum sayfası ikonsuz çalışmaya devam eder", () => {
    write("ios/Ornek/Info.plist", "<plist/>");
    assert.equal(findAppIcon(path.join(projectPath, "ios"), "AppIcon"), "");
  });

  test("appiconset boşsa da boş dizge", () => {
    fs.mkdirSync(path.join(projectPath, "ios/Ornek/Images.xcassets/AppIcon.appiconset"), {
      recursive: true,
    });
    assert.equal(findAppIcon(path.join(projectPath, "ios"), "AppIcon"), "");
  });

  test("Pods/ taranmaz — orada binlerce dizin var", () => {
    write("ios/Pods/SomeLib/Images.xcassets/AppIcon.appiconset/1024.png", "x");
    assert.equal(findAppIcon(path.join(projectPath, "ios"), "AppIcon"), "");
  });
});

describe("podInstallCommand", () => {
  test("Gemfile varsa bundle exec — CocoaPods sürümü orada sabitli", () => {
    write("Gemfile", "gem 'cocoapods'");
    assert.deepEqual(podInstallCommand(projectPath), {
      file: "bundle",
      args: ["exec", "pod", "install"],
    });
  });

  test("Gemfile yoksa düz pod", () => {
    assert.deepEqual(podInstallCommand(projectPath), { file: "pod", args: ["install"] });
  });
});

describe("buildModeFlag", () => {
  test("RN 0.83.1 (example-rn-app ile doğrulandı) --mode", () => {
    // `react-native run-ios --help` çıktısı: `--mode <string>` var,
    // `--configuration` yok.
    assert.equal(buildModeFlag("0.83.1"), "--mode");
  });

  test("0.73 ve sonrası --mode", () => {
    assert.equal(buildModeFlag("0.76.0"), "--mode");
    assert.equal(buildModeFlag("^0.73.0"), "--mode");
    assert.equal(buildModeFlag("0.73.0"), "--mode");
  });

  test("0.73 öncesi --configuration", () => {
    assert.equal(buildModeFlag("0.72.6"), "--configuration");
    assert.equal(buildModeFlag("~0.71.0"), "--configuration");
  });

  test("aralık okunamazsa yeni bayrağa düşer", () => {
    assert.equal(buildModeFlag(undefined), "--mode");
    assert.equal(buildModeFlag("*"), "--mode");
  });

  test("1.x geldiğinde de yeni bayrak", () => {
    assert.equal(buildModeFlag("1.0.0"), "--mode");
  });
});
