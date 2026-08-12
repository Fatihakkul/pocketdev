import type { CommandContext } from "../../channels/channel.js";
import { formatDoctorReport, runDoctor } from "../../workflows/doctor.js";
import * as state from "../../core/state.js";
import { projectExists, resolveProjectPath } from "../../core/workspace.js";
import { m } from "../../i18n/index.js";

export async function handleDoctor(ctx: CommandContext): Promise<void> {
  // Proje ZORUNLU değil: makine düzeyindeki eksikler (Xcode, sertifika, tünel)
  // proje seçilmeden de anlamlı ve kurulumun ilk anında sorulan şey bu.
  const name = state.getActiveProject(ctx.conversationId);
  const active = name && projectExists(name) ? { name, path: resolveProjectPath(name) } : undefined;

  const progress = await ctx.respond.progress(m().doctor.checking);
  try {
    const results = await runDoctor(active?.path);
    await progress.remove();
    await ctx.respond.markup(formatDoctorReport(results, active?.name));
  } catch (error) {
    await progress.remove();
    await ctx.respond.text(m().doctor.failed((error as Error).message));
  }
}
