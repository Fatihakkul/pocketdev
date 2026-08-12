import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { config } from "../../config.js";
import { projectExists, resolveProjectPath } from "../../core/workspace.js";
import { m } from "../../i18n/index.js";

export const SCRATCH_CONTEXT_NAME = "_scratch";

export interface ActiveProject {
  name: string;
  path: string;
}

export async function requireActiveProject(ctx: CommandContext): Promise<ActiveProject | undefined> {
  const name = state.getActiveProject(ctx.conversationId);
  if (!name || !projectExists(name)) {
    await ctx.respond.text(m().project.noneActive);
    return undefined;
  }
  return { name, path: resolveProjectPath(name) };
}

/**
 * Aktif bir proje varsa onu döner; yoksa proje seçimi gerektirmeyen genel
 * bir "scratch" konuşma alanına düşer (serbest planlama/roadmap sohbetleri için).
 */
export function getEffectiveContext(conversationId: number): ActiveProject {
  const name = state.getActiveProject(conversationId);
  if (name && projectExists(name)) {
    return { name, path: resolveProjectPath(name) };
  }
  return { name: SCRATCH_CONTEXT_NAME, path: config.scratchDir };
}
