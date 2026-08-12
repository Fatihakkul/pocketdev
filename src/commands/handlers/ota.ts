import path from "node:path";
import type { CommandContext } from "../../channels/channel.js";
import * as otaRunner from "../../workflows/otaRunner.js";
import * as jobs from "../../core/jobs.js";
import { requireActiveProject } from "./common.js";
import { m } from "../../i18n/index.js";

function formatMinutes(ms: number): string {
  return m().build.minutes(Math.round(ms / 60_000));
}

export async function handleOtaBuild(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  if (otaRunner.isBuilding(ctx.conversationId)) {
    await ctx.respond.text(m().ota.alreadyBuilding);
    return;
  }

  const mode = (ctx.args[0] ?? "").toLowerCase();
  if (mode && mode !== "dev") {
    await ctx.respond.text(m().ota.usage);
    return;
  }
  const configuration = mode === "dev" ? "Debug" : "Release";

  const progress = await ctx.respond.progress(
    m().ota.started(configuration)
  );

  const job = jobs.startJob({
    kind: "otabuild",
    label: configuration,
    project: project.name,
    channel: ctx.channel,
    logPath: path.join(project.path, "build", "archive.log"),
  });

  const updateProgress = (elapsedMs: number, stage: string, lastLine?: string): void => {
    job.progress(`${stage}${lastLine ? ` — ${lastLine.slice(0, 200)}` : ""}`);
    void progress.update(
      m().ota.progress(stage, formatMinutes(elapsedMs)) + (lastLine ? `\n\n${lastLine.slice(0, 200)}` : "")
    );
  };

  try {
    const result = await otaRunner.startOtaBuild(ctx.conversationId, project.path, configuration, updateProgress);
    job.succeed(result.installUrl);
    await progress.remove();
    const nextStep =
      configuration === "Debug" ? m().ota.debugNote : m().ota.releaseNote;
    // Eşitleme çalıştıysa bunu söylemek önemli: native proje yeniden üretildiği
    // için telefondaki eski build ile bu build native tarafta farklı. Hangi aracın
    // çalıştığı (prebuild mı pod install mı) adapter'ın bilgisi, mesajın değil.
    const prebuildNote = result.prebuilt
      ? m().ota.resynced
      : "";
    await ctx.respond.markup(
      `${m().ota.ready(formatMinutes(result.durationMs), result.installUrl)}\n\n` +
        prebuildNote +
        `${m().ota.openInSafari}\n\n` +
        `${nextStep}\n` +
        `${m().ota.overwriteWarning}\n` +
        m().ota.expiryWarning(result.expiresInMinutes)
    );
  } catch (error) {
    job.fail((error as Error).message);
    await progress.remove();
    await ctx.respond.text(m().ota.failed((error as Error).message));
  }
}

export async function handleOtaStop(ctx: CommandContext): Promise<void> {
  const stopped = await otaRunner.stop(ctx.conversationId);
  await ctx.respond.text(stopped ? m().ota.stopped : m().ota.noLink);
}

export async function handleOtaLink(ctx: CommandContext): Promise<void> {
  const url = otaRunner.getInstallUrl(ctx.conversationId);
  await ctx.respond.text(url ? m().ota.linkIs(url) : m().ota.noLinkHint);
}
