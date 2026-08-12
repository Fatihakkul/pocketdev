import type { CommandContext } from "../../channels/channel.js";
import { m } from "../../i18n/index.js";
import { commands } from "../registry.js";

/**
 * Yardım metni komut kayıt defterinden üretiliyor; elle tutulan bir liste yok.
 * Yeni komut eklendiğinde burada güncelleme gerekmiyor — eskiden bu liste
 * kolayca gerçeklikle uyumsuz kalıyordu.
 */
export async function handleHelp(ctx: CommandContext): Promise<void> {
  const lines = commands.map((command) => {
    const usage = command.usage ? ` ${command.usage}` : "";
    return `/${command.name}${usage} - ${command.description}`;
  });
  await ctx.respond.text(`${m().help.heading}\n${lines.join("\n")}\n${m().help.footer}`);
}
