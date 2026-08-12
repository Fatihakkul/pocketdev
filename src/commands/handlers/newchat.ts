import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { SCRATCH_CONTEXT_NAME } from "./common.js";
import { m } from "../../i18n/index.js";

export async function handleNewChat(ctx: CommandContext): Promise<void> {
    const previousProject = state.getActiveProject(ctx.conversationId);
  if (previousProject) {
    state.clearSessionId(ctx.conversationId, previousProject);
    state.clearActiveProject(ctx.conversationId);
  }
  state.clearSessionId(ctx.conversationId, SCRATCH_CONTEXT_NAME);
  state.setSessionUnlocked(ctx.conversationId, true);

  await ctx.respond.text(
    m().chat.started
  );
}
