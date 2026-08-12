import type { CommandContext } from "../../channels/channel.js";
import * as qaBuildRunner from "../../workflows/qaBuildRunner.js";
import * as jobs from "../../core/jobs.js";
import { requireActiveProject } from "./common.js";
import { m } from "../../i18n/index.js";

export async function handleDevBuild(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  if (qaBuildRunner.isBuilding(ctx.conversationId)) {
    await ctx.respond.text(m().build.devAlreadyRunning);
    return;
  }

  const progress = await ctx.respond.progress(
    m().build.devStarted
  );
  const job = jobs.startJob({ kind: "devbuild", label: "development", project: project.name, channel: ctx.channel });

  try {
    const result = await qaBuildRunner.startQaBuild(ctx.conversationId, project.path, "development");
    job.succeed(result.pageUrl);
    await progress.remove();
    await ctx.respond.text(
      m().build.devReady(result.pageUrl, result.downloadUrl ?? "")
    );
  } catch (error) {
    job.fail((error as Error).message);
    await progress.remove();
    await ctx.respond.text(m().build.devFailed((error as Error).message));
  }
}
