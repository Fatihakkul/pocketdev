import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { getEffectiveContext } from "./common.js";
import { m } from "../../i18n/index.js";

export async function handleEndChat(ctx: CommandContext): Promise<void> {
    const context = getEffectiveContext(ctx.conversationId);
  state.clearSessionId(ctx.conversationId, context.name);
  state.setSessionUnlocked(ctx.conversationId, false);

  await ctx.respond.text(
    m().chat.ended
  );
}
