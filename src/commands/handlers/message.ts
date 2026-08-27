import type { CommandContext } from "../../channels/channel.js";
import * as claudeRunner from "../../claude/claudeRunner.js";
import * as state from "../../core/state.js";
import { sandboxStatus } from "../../claude/sandboxSelfTest.js";
import { getEffectiveContext } from "./common.js";
import { m } from "../../i18n/index.js";

export async function handleMessage(ctx: CommandContext): Promise<void> {
  if (!state.isSessionUnlocked(ctx.conversationId)) {
    await ctx.respond.text(m().chat.locked);
    return;
  }

  // Kanal üzerinden açılan oturumlar yalnızca sandbox'ın uygulandığı ÖLÇÜLDÜKTEN
  // sonra çalışır. Bu kontrol kullanıcının kendi interaktif oturumunu etkilemez.
  const sandbox = sandboxStatus();
  if (!sandbox) {
    await ctx.respond.text(m().chat.sandboxVerifying);
    return;
  }
  if (!sandbox.verified) {
    await ctx.respond.text(m().chat.sandboxFailed(sandbox.detail));
    return;
  }

  const project = getEffectiveContext(ctx.conversationId);

  if (claudeRunner.isBusy(ctx.conversationId)) {
    await ctx.respond.text(m().chat.busy);
    return;
  }

  const progress = await ctx.respond.progress(m().chat.working);
  try {
    const result = await claudeRunner.run(ctx.conversationId, project.path, project.name, ctx.raw);
    await progress.remove();
    if (result.isError) {
      await ctx.respond.text(`⚠️ ${result.text}`);
      return;
    }
    // Geçmiş kaybedildiyse önce onu söyle: cevabın kendisi akıcı geldiği için
    // kullanıcı aksi hâlde amnezi olduğunu fark etmiyor.
    if (result.historyReset) {
      await ctx.respond.text(m().chat.historyReset);
    }
    await ctx.respond.text(result.text);
  } catch (error) {
    await progress.remove();
    await ctx.respond.text(m().fs.error((error as Error).message));
  }
}
