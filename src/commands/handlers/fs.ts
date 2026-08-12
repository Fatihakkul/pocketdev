import type { CommandContext } from "../../channels/channel.js";
import fs from "node:fs";
import path from "node:path";
import { requireActiveProject } from "./common.js";
import { resolveInside, SandboxViolationError } from "../../core/workspace.js";
import { m } from "../../i18n/index.js";

export async function handlePwd(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;
  await ctx.respond.text(project.path);
}

export async function handleLs(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  const sub = ctx.args[0] ?? ".";
  try {
    const target = resolveInside(project.path, sub);
    const entries = fs.readdirSync(target, { withFileTypes: true });
    if (entries.length === 0) {
      await ctx.respond.text(m().fs.empty);
      return;
    }
    const lines = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    await ctx.respond.text(lines.join("\n"));
  } catch (error) {
    if (error instanceof SandboxViolationError) {
      await ctx.respond.text(m().fs.outsideProject);
      return;
    }
    await ctx.respond.text(m().fs.error((error as Error).message));
  }
}

export async function handleMkdir(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  const [name] = ctx.args;
  if (!name) {
    await ctx.respond.text(m().fs.mkdirUsage);
    return;
  }
  try {
    const target = resolveInside(project.path, name);
    fs.mkdirSync(target, { recursive: true });
    await ctx.respond.text(m().fs.created(path.relative(project.path, target) || "."));
  } catch (error) {
    if (error instanceof SandboxViolationError) {
      await ctx.respond.text(m().fs.outsideProject);
      return;
    }
    await ctx.respond.text(m().fs.error((error as Error).message));
  }
}
