import type { CommandContext } from "../../channels/channel.js";
import path from "node:path";
import { execa } from "execa";
import { requireActiveProject } from "./common.js";
import { resolveInside, SandboxViolationError } from "../../core/workspace.js";
import { m } from "../../i18n/index.js";

const DIFF_TEXT_LIMIT = 3500;

// Yer kaplayıp gürültü yapan lock dosyaları, /diff'te bir alt yol belirtilmediği sürece hariç tutulur.
const LOCK_FILE_EXCLUDES = [
  ":!package-lock.json",
  ":!yarn.lock",
  ":!pnpm-lock.yaml",
  ":!bun.lockb",
  ":(glob,exclude)*.lock",
];

export async function handleDiff(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  const [subPath] = ctx.args;
  const gitArgs = ["diff"];
  if (subPath) {
    try {
      const target = resolveInside(project.path, subPath);
      gitArgs.push("--", path.relative(project.path, target));
    } catch (error) {
      if (error instanceof SandboxViolationError) {
        await ctx.respond.text(m().fs.outsideProject);
        return;
      }
      throw error;
    }
  } else {
    gitArgs.push("--", ".", ...LOCK_FILE_EXCLUDES);
  }

  try {
    const { stdout } = await execa("git", gitArgs, { cwd: project.path });
    if (stdout.trim().length === 0) {
      await ctx.respond.text(m().fs.noChanges);
      return;
    }
    if (stdout.length <= DIFF_TEXT_LIMIT) {
      await ctx.respond.code(stdout);
    } else {
      await ctx.respond.document(`${project.name}.diff`, stdout);
    }
  } catch (error) {
    await ctx.respond.text(m().fs.diffFailed((error as Error).message));
  }
}
