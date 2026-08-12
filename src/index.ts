import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import type { Context } from "telegraf";
import { config } from "./config.js";
import { requireAuthorizedUser } from "./channels/auth.js";
import { currentClaimCode, currentOwnerId } from "./channels/ownership.js";
import { m } from "./i18n/index.js";
import { ensureScratchDir, ensureWorkspaceRoot } from "./core/workspace.js";
import { commands } from "./commands/registry.js";
import { telegramResponder } from "./channels/telegram.js";
import type { CommandContext } from "./channels/channel.js";
import { handleMessage } from "./commands/handlers/message.js";
import * as previewRunner from "./workflows/previewRunner.js";
import * as otaRunner from "./workflows/otaRunner.js";
import { startWebPanel } from "./panel/server.js";
import { verifySandbox } from "./claude/sandboxSelfTest.js";

ensureWorkspaceRoot();
ensureScratchDir();

// Telegraf'ın varsayılan 90s handler timeout'u, Claude Code'un uzun süren
// görevleri (10dk, claudeRunner.ts), /preview'ın tunnel bekleme süresi (20dk,
// devServer.ts), /qabuild'ın EAS build bekleme süresi (30dk, qaBuildRunner.ts) ve
// /localbuild'ın yerel xcodebuild süresi (30dk, localBuildRunner.ts)
// için yetersiz kalıyor. En uzun kendi timeout'umuzun üzerinde tutuyoruz ki asıl
// hata mesajı bizim try/catch'lerimizden gelsin, Telegraf'ın genel timeout'undan değil.
const bot = new Telegraf(config.botToken, { handlerTimeout: 35 * 60 * 1000 });

bot.use(requireAuthorizedUser);

/** Telegraf context'ini kanal bağımsız komut bağlamına çevirir. */
function toCommandContext(ctx: Context, raw: string): CommandContext | undefined {
  const conversationId = ctx.chat?.id;
  if (!conversationId) return undefined;

  return {
    conversationId,
    args: raw.trim().split(/\s+/).slice(1),
    raw,
    channel: "telegram",
    respond: telegramResponder(ctx),
  };
}

// Komutlar tek kaynaktan (commands.ts) bağlanıyor; yeni komut eklemek için
// burayı değiştirmek gerekmiyor.
for (const command of commands) {
  for (const name of [command.name, ...(command.aliases ?? [])]) {
    bot.command(name, async (ctx) => {
      const commandContext = toCommandContext(ctx, ctx.message.text);
      if (commandContext) await command.run(commandContext);
    });
  }
}

bot.on(message("text"), async (ctx) => {
  if (ctx.message.text.startsWith("/")) return; // tanınmayan komut, yok say
  const commandContext = toCommandContext(ctx, ctx.message.text);
  if (commandContext) await handleMessage(commandContext);
});

bot.catch((error, ctx) => {
  console.error("Unhandled error:", error);
  ctx.reply("Beklenmeyen bir hata oluştu.").catch(() => {});
});

const webPanel = startWebPanel();

// Sandbox'ın gerçekten uygulandığını ölçüyoruz. Doğrulanana kadar serbest
// mesajlar (yani Claude oturumları) reddediliyor — yanlış yazılmış bir ayar
// anahtarı sessizce yok sayıldığı için "açık sanıp kapalı kalmak" mümkün.
void verifySandbox().then((result) => {
  console.log(
    result.verified ? `Sandbox doğrulandı: ${result.detail}` : `UYARI — sandbox doğrulanamadı: ${result.detail}`
  );
});

// Sahiplenilmemişse kod konsola basılıyor. Kurulumun tek "bilgi bulma" adımı
// bu ve makineye erişim gerektiriyor — kullanıcının kendi sayısal Telegram
// id'sini üçüncü parti bir bottan öğrenmesine gerek kalmıyor.
// Yeni bir kullanıcının gördüğü İLK çıktı ve kurulumun devamı buna bağlı.
if (currentOwnerId() === undefined) {
  console.log(m().auth.unclaimedConsole(currentClaimCode()));
}

bot.launch().then(
  () => console.log("Telegram-Claude bridge bot started."),
  (error) => {
    console.error("Bot başlatılamadı:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
);

function shutdown(signal: "SIGINT" | "SIGTERM"): void {
  previewRunner.stopAll();
  otaRunner.stopAll();
  webPanel.close();
  bot.stop(signal);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
