import type { CommandContext } from "../../channels/channel.js";
import { listAllTemplates } from "../../platform/expo/templateRegistry.js";

export async function handleTemplates(ctx: CommandContext): Promise<void> {
  const templates = listAllTemplates();
  const lines = templates.map((t) => `• ${t.name} — ${t.describe()}`);
  await ctx.respond.text(lines.join("\n"));
}
