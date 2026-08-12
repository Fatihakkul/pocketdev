import type { CommandContext } from "../../channels/channel.js";
import * as state from "../../core/state.js";
import { ensureWorkspaceRoot, isValidProjectName, projectExists, resolveProjectPath } from "../../core/workspace.js";
import { getTemplate, listAllTemplates, resolveDefaultTemplate } from "../../platform/expo/templateRegistry.js";
import { m } from "../../i18n/index.js";

export async function handleNew(ctx: CommandContext): Promise<void> {
  const [name, templateName] = ctx.args;
  if (!name) {
    await ctx.respond.text(m().project.newUsage);
    return;
  }
  if (!isValidProjectName(name)) {
    await ctx.respond.text(m().project.invalidName);
    return;
  }
  if (projectExists(name)) {
    await ctx.respond.text(m().project.alreadyExists(name));
    return;
  }

  let template;
  if (templateName) {
    template = getTemplate(templateName);
    if (!template) {
      await ctx.respond.text(m().project.templateNotFound(templateName));
      return;
    }
  } else if (listAllTemplates().length > 2) {
    await ctx.respond.text(m().project.templateAmbiguous);
    return;
  } else {
    template = resolveDefaultTemplate();
  }

  ensureWorkspaceRoot();
  const destPath = resolveProjectPath(name);
  const progress = await ctx.respond.progress(m().project.creating(name, template.name));

  try {
    await template.scaffold(destPath, name);
  } catch (error) {
    await ctx.respond.text(m().project.createFailed((error as Error).message));
    return;
  }

  state.setActiveProject(ctx.conversationId, name);
  await progress.update(`✅ "${name}" oluşturuldu ve aktif proje yapıldı.`);
}
