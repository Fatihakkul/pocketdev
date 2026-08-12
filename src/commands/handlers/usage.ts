import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { m } from "../../i18n/index.js";

function isZeroUsage(usage: state.UsageStats): boolean {
  return (
    usage.inputTokens === 0 &&
    usage.outputTokens === 0 &&
    usage.cacheCreationTokens === 0 &&
    usage.cacheReadTokens === 0 &&
    usage.costUsd === 0
  );
}

function formatUsage(usage: state.UsageStats): string {
  return [
    `${m().usage.inputTokens}: ${usage.inputTokens}`,
    `${m().usage.outputTokens}: ${usage.outputTokens}`,
    `${m().usage.cacheWrite}: ${usage.cacheCreationTokens}`,
    `${m().usage.cacheRead}: ${usage.cacheReadTokens}`,
    `${m().usage.totalCost}: $${usage.costUsd.toFixed(4)}`,
  ].join("\n");
}

export async function handleUsage(ctx: CommandContext): Promise<void> {
    const total = state.getUsage(ctx.conversationId);
  if (isZeroUsage(total)) {
    await ctx.respond.text(m().usage.none);
    return;
  }

  const activeProject = state.getActiveProject(ctx.conversationId);
  let text = `${m().usage.total}\n${formatUsage(total)}`;

  if (activeProject) {
    const projectUsage = state.getUsage(ctx.conversationId, activeProject);
    text += `\n\n${m().usage.forProject(activeProject)}\n${formatUsage(projectUsage)}`;
  }

  await ctx.respond.text(text);
}
