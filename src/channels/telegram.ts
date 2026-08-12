import type { Context } from "telegraf";
import type { ProgressMessage, Responder } from "./channel.js";
import { escapeHtml, markupToHtml } from "../core/markup.js";

/** Telegram mesaj sınırı 4096; altında güvenli bir pay bırakıyoruz. */
const MAX_CHUNK_LENGTH = 3500;

function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt <= 0) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Telegraf `Context`'ini kanal bağımsız `Responder`'a sarar.
 *
 * Parçalama burada: 4096 karakter sınırı Telegram'a özgü, web panelinde
 * karşılığı yok. Handler'ların bunu bilmesine gerek kalmıyor.
 */
export function telegramResponder(ctx: Context): Responder {
  const send = async (text: string): Promise<void> => {
    const content = text.trim().length > 0 ? text : "(boş cevap)";
    for (const chunk of chunkText(content, MAX_CHUNK_LENGTH)) {
      await ctx.reply(chunk);
    }
  };

  return {
    text: send,

    markup: async (message) => {
      const content = message.trim().length > 0 ? message : "(boş cevap)";
      for (const chunk of chunkText(content, MAX_CHUNK_LENGTH)) {
        await ctx.reply(markupToHtml(chunk), { parse_mode: "HTML" });
      }
    },

    code: async (message) => {
      const content = message.trim().length > 0 ? message : "(boş)";
      for (const chunk of chunkText(content, MAX_CHUNK_LENGTH)) {
        await ctx.reply(`<pre>${escapeHtml(chunk)}</pre>`, { parse_mode: "HTML" });
      }
    },

    document: async (filename, content) => {
      await ctx.replyWithDocument({ source: Buffer.from(content, "utf-8"), filename });
    },

    photo: async (image, caption) => {
      await ctx.replyWithPhoto({ source: image }, caption ? { caption } : undefined);
    },

    video: async (video, caption) => {
      await ctx.replyWithVideo({ source: video }, caption ? { caption } : undefined);
    },

    progress: async (message): Promise<ProgressMessage> => {
      const sent = await ctx.reply(message);
      return {
        // İçerik değişmediyse Telegram hata döner; ilerleme mesajı kritik
        // olmadığı için sessizce yutuyoruz.
        update: async (text) => {
          await ctx.telegram
            .editMessageText(sent.chat.id, sent.message_id, undefined, text)
            .then(() => undefined)
            .catch(() => undefined);
        },
        remove: async () => {
          await ctx.telegram
            .deleteMessage(sent.chat.id, sent.message_id)
            .then(() => undefined)
            .catch(() => undefined);
        },
      };
    },
  };
}
