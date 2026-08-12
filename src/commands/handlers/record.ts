import type { CommandContext } from "../../channels/channel.js";
import * as recordRunner from "../../workflows/recordRunner.js";
import { requireActiveProject } from "./common.js";
import { m } from "../../i18n/index.js";

export async function handleRecord(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  if (recordRunner.isRecording(ctx.conversationId)) {
    await ctx.respond.text(m().record.alreadyRunning);
    return;
  }

  const progress = await ctx.respond.progress(
    "⏳ iOS simülatöründe uygulama başlatılıp video kaydediliyor (ilk seferde birkaç dakika sürebilir)..."
  );
  try {
    const video = await recordRunner.recordDemo(ctx.conversationId, project.path);
    await progress.remove();
    await ctx.respond.video(video, m().record.caption(project.name));
  } catch (error) {
    await progress.remove();
    await ctx.respond.text(m().record.failed((error as Error).message));
  }
}
