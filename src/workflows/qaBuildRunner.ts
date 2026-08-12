import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import { RunLock } from "../core/runLock.js";
import { ensureSupported } from "../platform/adapter.js";
import { m } from "../i18n/index.js";

const POLL_INTERVAL_MS = 20_000;
const BUILD_TIMEOUT_MS = 30 * 60 * 1000; // EAS kuyruk + native build genelde 10-20dk sürüyor

// `preview` profili = Release build: JS bundle gömülü, Mac'te hiçbir şey açık
// olmadan çalışır. QA için gereken budur.
//
// Bu build /preview ile dev mode'a BAĞLANAMAZ ve bu bir eksiklik değil, Expo'nun
// tasarımı. Kanıt zinciri (SDK 57):
//   expo/ios/EXAppDefinesLoader.m          → APP_DEBUG yalnızca #if DEBUG
//   expo-dev-launcher/ios/ReactDelegateHandler/ExpoDevLauncherReactDelegateHandler.swift:47
//                                          → if !EXAppDefines.APP_DEBUG { return nil }
// Yani Release'de EXDevLauncherController.start() hiç çağrılmaz; deep link
// yakalanmaz, Metro'ya bağlanılmaz. Şemanın doğru olması da bir şey değiştirmez.
//
// Fast refresh'li canlı geliştirme için AYRI bir Debug build gerekir:
//   - yerelde: `npx expo run:ios --device` (EAS kredisi harcamaz, bkz. docs/LOCAL_BUILD.md)
//   - EAS'te:  `developmentClient: true` olan ayrı bir profil
// Bu ikisi tek build'de birleştirilemez; `preview` profiline `developmentClient`
// eklersen gömülü bundle kalkar ve QA build'i offline kullanılamaz hale gelir.
export type BuildProfile = "preview" | "development";

const BUILD_PROFILES = {
  // /qabuild → Release. Gömülü bundle, offline çalışır, dev mode YOK.
  preview: {
    distribution: "internal",
    ios: {
      simulator: false,
    },
  },
  // /devbuild → Debug. Dev launcher aktif, /preview tunnel'ına bağlanır ve
  // fast refresh çalışır. Gömülü bundle yok, dev sunucu açık olmalı.
  development: {
    developmentClient: true,
    distribution: "internal",
    ios: {
      simulator: false,
    },
  },
} as const;

const EAS_JSON_TEMPLATE = {
  cli: {
    version: ">= 16.0.0",
    appVersionSource: "remote",
  },
  build: BUILD_PROFILES,
};

interface EasBuildInfo {
  id: string;
  status: string;
  artifacts?: { buildUrl?: string };
  project: { slug: string; ownerAccount: { name: string } };
}

export interface QaBuildResult {
  status: string;
  pageUrl: string;
  downloadUrl?: string;
}

const buildLock = new RunLock();

export function isBuilding(conversationId: number): boolean {
  return buildLock.isActive(conversationId);
}

/**
 * eas.json yoksa şablondan oluşturur; varsa sadece EKSİK olan profili ekler.
 * Mevcut profillere dokunmaz — elle yapılmış ayarlar ezilmesin diye.
 */
function ensureEasJson(projectPath: string, profile: BuildProfile): void {
  const easJsonPath = path.join(projectPath, "eas.json");
  if (!fs.existsSync(easJsonPath)) {
    fs.writeFileSync(easJsonPath, JSON.stringify(EAS_JSON_TEMPLATE, null, 2) + "\n");
    return;
  }

  const easJson = JSON.parse(fs.readFileSync(easJsonPath, "utf-8"));
  easJson.build ??= {};
  if (easJson.build[profile]) return;

  easJson.build[profile] = BUILD_PROFILES[profile];
  fs.writeFileSync(easJsonPath, JSON.stringify(easJson, null, 2) + "\n");
}

function readAppJson(projectPath: string): any {
  const appJsonPath = path.join(projectPath, "app.json");
  if (!fs.existsSync(appJsonPath)) return undefined;
  return JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
}

async function pollBuild(projectPath: string, buildId: string): Promise<EasBuildInfo> {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { stdout } = await execa("eas", ["build:view", buildId, "--json"], { cwd: projectPath });
    const info = JSON.parse(stdout) as EasBuildInfo;
    if (info.status === "FINISHED" || info.status === "ERRORED" || info.status === "CANCELED") {
      return info;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(m().runtime.buildTimedOut);
}

export async function startQaBuild(
  conversationId: number,
  projectPath: string,
  profile: BuildProfile = "preview"
): Promise<QaBuildResult> {
  return buildLock.run(conversationId, "Zaten bir build sürüyor, lütfen bekle.", async () => {
    const appJson = readAppJson(projectPath);
    // /qabuild EAS'e ve app.json'daki Expo alanlarına bağlı; adapter bu komutu
    // desteklemiyorsa (ör. RN CLI projesi) burada net bir hatayla duruyoruz.
    await ensureSupported(projectPath, "qabuild");

    if (!appJson?.expo?.ios?.bundleIdentifier) {
      throw new Error(m().runtime.noBundleIdentifierBeforeBuild);
    }

    ensureEasJson(projectPath, profile);

    if (!appJson?.expo?.extra?.eas?.projectId) {
      await execa("eas", ["init", "--force", "--non-interactive"], { cwd: projectPath });
    }

    let buildId: string;
    try {
      const { stdout } = await execa(
        "eas",
        ["build", "--platform", "ios", "--profile", profile, "--non-interactive", "--no-wait", "--json"],
        { cwd: projectPath }
      );
      const parsed = JSON.parse(stdout) as EasBuildInfo[];
      const first = parsed[0];
      if (!first) throw new Error(m().runtime.buildNotStarted);
      buildId = first.id;
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("couldn't find any credentials") || message.includes("Failed to set up credentials")) {
        throw new Error(
          "Bu proje için EAS kimlik bilgileri (sertifika/provisioning profile) henüz kurulmamış. Bu tek seferlik bir kurulum — Claude Code oturumunda elle yapılması gerekiyor, haber ver."
        );
      }
      throw error;
    }

    const info = await pollBuild(projectPath, buildId);
    const pageUrl = `https://expo.dev/accounts/${info.project.ownerAccount.name}/projects/${info.project.slug}/builds/${info.id}`;

    if (info.status !== "FINISHED") {
      throw new Error(`Build başarısız oldu (${info.status}). Detaylar: ${pageUrl}`);
    }

    return { status: info.status, pageUrl, downloadUrl: info.artifacts?.buildUrl };
  });
}
