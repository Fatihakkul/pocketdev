import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { m } from "../../i18n/index.js";

export async function handleModel(ctx: CommandContext): Promise<void> {
    const [name] = ctx.args;
  if (!name) {
    const forced = state.getModel(ctx.conversationId);
    if (forced) {
      await ctx.respond.text(m().model.forced(forced));
      return;
    }
    const last = state.getLastModel(ctx.conversationId);
    await ctx.respond.text(
      last
        ? m().model.notForcedWithLast(last)
        : m().model.notForced
    );
    return;
  }

  state.setModel(ctx.conversationId, name);
  await ctx.respond.text(m().model.set(name));
}
