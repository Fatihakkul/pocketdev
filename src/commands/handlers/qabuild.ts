import type { CommandContext } from "../../channels/channel.js";
import * as qaBuildRunner from "../../workflows/qaBuildRunner.js";
import * as jobs from "../../core/jobs.js";
import { requireActiveProject } from "./common.js";
import { m } from "../../i18n/index.js";

export async function handleQaBuild(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  if (qaBuildRunner.isBuilding(ctx.conversationId)) {
    await ctx.respond.text(m().build.qaAlreadyRunning);
    return;
  }

  const progress = await ctx.respond.progress(
    m().build.qaStarted
  );
  const job = jobs.startJob({ kind: "qabuild", label: "preview", project: project.name, channel: ctx.channel });

  try {
    const result = await qaBuildRunner.startQaBuild(ctx.conversationId, project.path);
    job.succeed(result.pageUrl);
    await progress.remove();
    await ctx.respond.text(
      m().build.qaReady(result.pageUrl, result.downloadUrl ?? "")
    );
  } catch (error) {
    job.fail((error as Error).message);
    await progress.remove();
    await ctx.respond.text(m().build.qaFailed((error as Error).message));
  }
}
