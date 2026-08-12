import type { CommandContext } from "../../channels/channel.js";
import * as previewRunner from "../../workflows/previewRunner.js";
import { m } from "../../i18n/index.js";

export async function handleStopPreview(ctx: CommandContext): Promise<void> {
    const stopped = await previewRunner.stop(ctx.conversationId);
  await ctx.respond.text(stopped ? m().preview.stopped : m().preview.notRunning);
}
