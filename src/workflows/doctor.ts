import { execa } from "execa";
import * as ipaExporter from "../platform/ios/ipaExporter.js";
import * as otaServer from "../platform/ios/otaServer.js";
import { getAdapter } from "../platform/adapter.js";
import { m } from "../i18n/index.js";

/**
 * Kurulum ön kontrolü.
 *
 * Var olma sebebi kurulum sürtünmesi: bugün eksik bir parça ancak onu kullanan
 * komut çalıştırıldığında, çoğu zaman dakikalarca süren bir işin ortasında
 * ortaya çıkıyor. `/doctor` hepsini saniyeler içinde, tek seferde söylüyor.
 *
 * Kontrollerin çoğu yeni kod değil — `findDistributionIdentity`,
 * `findAdHocProfile` ve tünel ön kontrolü zaten yazılmıştı; buradaki iş onları
 * tek yerden çağırmak.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** Yalnızca sorun varken doldurulur; kullanıcıya gösterilecek çözüm. */
  fix?: string;
}

const ICON: Record<CheckStatus, string> = { ok: "✅", warn: "⚠️", fail: "❌" };

/**
 * Raporu metne çevirir. Saf fonksiyon — biçimlendirme kolayca sessizce bozulan
 * ve gözden kaçan türden olduğu için ayrı tutuldu.
 */
export function formatDoctorReport(results: CheckResult[], projectName?: string): string {
  const failed = results.filter((r) => r.status === "fail").length;
  const warned = results.filter((r) => r.status === "warn").length;

  const lines = results.map((result) => {
    const head = `${ICON[result.status]} **${result.name}** — ${result.detail}`;
    return result.fix && result.status !== "ok" ? `${head}\n   ${result.fix.replace(/\n/g, "\n   ")}` : head;
  });

  const scope = projectName ? m().doctor.scopeWithProject(projectName) : m().doctor.scope;
  const summary =
    failed === 0 && warned === 0
      ? m().doctor.allGood
      : [failed > 0 ? m().doctor.countMissing(failed) : "", warned > 0 ? m().doctor.countWarnings(warned) : ""]
          .filter(Boolean)
          .join(", ");

  return `${scope}\n\n${lines.join("\n")}\n\n${summary}`;
}

/** Bir aracın varlığını sürüm komutuyla sınar. */
async function checkTool(
  name: string,
  file: string,
  args: string[],
  options: { fix: string; optional?: boolean }
): Promise<CheckResult> {
  const { stdout, exitCode } = await execa(file, args, { reject: false });
  if (exitCode === 0) {
    return { name, status: "ok", detail: stdout.split("\n")[0]?.trim() || m().doctor.installed };
  }
  return {
    name,
    status: options.optional ? "warn" : "fail",
    detail: m().doctor.notFound,
    fix: options.fix,
  };
}

/**
 * Takım kimliği bilinmeden dağıtım sertifikası aranıyor: `/doctor` proje
 * seçilmeden de çalışabilmeli. Proje varsa profil kontrolü zaten takımı
 * doğruluyor.
 */
async function checkDistributionCertificate(): Promise<CheckResult> {
  const name = m().doctor.certificate;
  const { stdout } = await execa("security", ["find-identity", "-v", "-p", "codesigning"], { reject: false });

  const identities = stdout
    .split("\n")
    .map((line) => /^\s*\d+\)\s+[0-9A-F]{40}\s+"(.+)"\s*$/.exec(line)?.[1])
    .filter((identity): identity is string => Boolean(identity) && identity!.includes("Distribution"));

  if (identities.length === 0) {
    return {
      name,
      status: "fail",
      detail: m().doctor.certificateMissing,
      fix: m().doctor.certificateFix,
    };
  }

  return { name, status: "ok", detail: identities.join(", ") };
}

async function checkTunnel(): Promise<CheckResult> {
  const name = m().doctor.tunnel;
  try {
    await otaServer.preflight();
    return { name, status: "ok", detail: m().doctor.tunnelReady };
  } catch (error) {
    return { name, status: "fail", detail: m().doctor.tunnelUnavailable, fix: (error as Error).message };
  }
}

/** Proje seçiliyse: tip tespiti, uygulama kimliği ve ad-hoc profil. */
async function checkProject(projectPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  let bundleId: string | undefined;
  try {
    const adapter = await getAdapter(projectPath);
    const info = await adapter.readAppInfo(projectPath);
    bundleId = info.bundleId;
    results.push({
      name: m().doctor.project,
      status: "ok",
      detail: `${adapter.kind} — ${info.appName} ${info.version} (${info.bundleId})`,
    });
  } catch (error) {
    results.push({
      name: m().doctor.project,
      status: "fail",
      detail: m().doctor.projectUnreadable,
      fix: (error as Error).message,
    });
    return results;
  }

  try {
    const profile = await ipaExporter.findAdHocProfile(bundleId);
    results.push({
      name: m().doctor.profile,
      status: "ok",
      detail: `${profile.name} (${profile.teamId})`,
    });
  } catch (error) {
    // Uyarı, hata değil: profil yalnızca `/otabuild` için gerekiyor.
    // `/localbuild`, `/preview` ve `/record` onsuz çalışıyor.
    results.push({
      name: m().doctor.profile,
      status: "warn",
      detail: m().doctor.profileMissing,
      fix: (error as Error).message,
    });
  }

  return results;
}

export async function runDoctor(projectPath?: string): Promise<CheckResult[]> {
  const [xcode, claude, pods, certificate, tunnel] = await Promise.all([
    checkTool(m().doctor.xcode, "xcodebuild", ["-version"], { fix: m().doctor.xcodeFix }),
    checkTool(m().doctor.claudeCode, "claude", ["--version"], { fix: m().doctor.claudeCodeFix }),
    checkTool(m().doctor.cocoapods, "pod", ["--version"], {
      optional: true,
      fix: m().doctor.cocoapodsFix,
    }),
    checkDistributionCertificate(),
    checkTunnel(),
  ]);

  const results = [xcode, claude, pods, certificate, tunnel];
  if (projectPath) results.push(...(await checkProject(projectPath)));
  return results;
}
