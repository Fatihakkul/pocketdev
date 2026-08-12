import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { projectExists } from "../../core/workspace.js";
import { m } from "../../i18n/index.js";

export async function handleUse(ctx: CommandContext): Promise<void> {
    const [name] = ctx.args;
  if (!name) {
    await ctx.respond.text(m().project.useUsage);
    return;
  }
  if (!projectExists(name)) {
    await ctx.respond.text(m().project.notFound(name));
    return;
  }

  state.setActiveProject(ctx.conversationId, name);
  await ctx.respond.text(m().project.switched(name));
}
