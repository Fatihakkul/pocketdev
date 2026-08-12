import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { listProjects } from "../../core/workspace.js";
import { m } from "../../i18n/index.js";

export async function handleProjects(ctx: CommandContext): Promise<void> {
    const active = ctx.conversationId ? state.getActiveProject(ctx.conversationId) : undefined;
  const projects = listProjects();

  if (projects.length === 0) {
    await ctx.respond.text(m().project.none);
    return;
  }

  const lines = projects.map((p) => (p === active ? `• ${p} (${m().project.activeSuffix})` : `• ${p}`));
  await ctx.respond.text(lines.join("\n"));
}
