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
  test("expo when package.json has the expo dependency", () => {
    write("package.json", `{"dependencies":{"expo":"~54.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("expo in devDependencies counts too", () => {
    write("package.json", `{"devDependencies":{"expo":"~54.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("without the dependency, the expo key in app.json is enough", () => {
    write("package.json", `{"dependencies":{}}`);
    write("app.json", `{"expo":{"name":"x"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("without the dependency, the presence of app.config.ts is enough", () => {
    write("package.json", `{"dependencies":{}}`);
    write("app.config.ts", `export default { expo: { name: "x" } };`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("app.config.json is an Expo signal too", () => {
    write("package.json", `{"dependencies":{}}`);
    write("app.config.json", `{"expo":{"name":"x"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("react-native-cli when ios/Podfile and react-native are present", () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    assert.equal(detectProjectKind(projectPath), "react-native-cli");
  });

  test("app.json in an RN CLI project does not make it Expo — it only carries the app name there", () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    write("app.json", `{"name":"MyApp","displayName":"My App"}`);
    assert.equal(detectProjectKind(projectPath), "react-native-cli");
  });

  test("Expo is checked before RN CLI — an Expo project has a Podfile too", () => {
    write("package.json", `{"dependencies":{"expo":"~54.0.0","react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    assert.equal(detectProjectKind(projectPath), "expo");
  });

  test("react-native without a Podfile is not recognised — it may not be prebuilt yet", () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    assert.equal(detectProjectKind(projectPath), undefined);
  });

  test("a non-mobile folder is not recognised", () => {
    write("package.json", `{"dependencies":{"express":"4.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), undefined);
  });

  test("an empty folder and a broken package.json do not crash it", () => {
    assert.equal(detectProjectKind(projectPath), undefined);
    write("package.json", "bu json değil");
    assert.equal(detectProjectKind(projectPath), undefined);
  });

  test("the result is not cached — a dependency can be added later", () => {
    write("package.json", `{"dependencies":{}}`);
    assert.equal(detectProjectKind(projectPath), undefined);

    write("package.json", `{"dependencies":{"expo":"~54.0.0"}}`);
    assert.equal(detectProjectKind(projectPath), "expo");
  });
});

describe("getAdapter", () => {
  test("returns the expo adapter for an Expo project", async () => {
    write("package.json", `{"dependencies":{"expo":"~54.0.0"}}`);
    const adapter = await getAdapter(projectPath);
    assert.equal(adapter.kind, "expo");
    assert.equal(adapter.supports("qabuild"), true);
  });

  test("returns the rn adapter for an RN CLI project, with /qabuild disabled", async () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    const adapter = await getAdapter(projectPath);
    assert.equal(adapter.kind, "react-native-cli");
    // /qabuild EAS'e ve app.json'daki Expo alanlarına bağlı.
    assert.equal(adapter.supports("qabuild"), false);
    assert.equal(adapter.supports("otabuild"), true);
    assert.equal(adapter.supports("localbuild"), true);
  });

  test("ensureSupported rejects an unsupported command and names the project type", async () => {
    write("package.json", `{"dependencies":{"react-native":"0.76.0"}}`);
    write("ios/Podfile", "platform :ios");
    await assert.rejects(
      ensureSupported(projectPath, "qabuild"),
      /\/qabuild bu proje tipinde \(react-native-cli\) desteklenmiyor/
    );
  });

  test("says iOS commands are unavailable in an unrecognised folder", async () => {
    await assert.rejects(getAdapter(projectPath), /tanınan bir mobil proje değil/);
  });
});
