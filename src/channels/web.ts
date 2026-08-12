import type { ProgressMessage, Responder } from "./channel.js";
import { markupToPlain } from "../core/markup.js";

export interface WebOutput {
  /** Handler'ın ürettiği metin çıktıları, sırayla. */
  messages: string[];
  /** En son ilerleme satırı. */
  progress?: string;
  /** Gönderilen medya/dosyaların kısa tanımı — panelde içerik gösterilmiyor. */
  attachments: string[];
}

/**
 * Panelden tetiklenen komutlar için `Responder`.
 *
 * Telegram'ın aksine mesajlar bir yere "gönderilmiyor"; toplanıp komut bitince
 * panele dönülüyor. Parçalama yok — Telegram'ın 4096 karakter sınırı buraya
 * ait değil.
 */
export function webResponder(output: WebOutput): Responder {
  return {
    text: async (message) => {
      output.messages.push(message);
    },

    // Panel düz metin gösteriyor; işaretlemeyi HTML'e çevirmek yerine
    // söküyoruz ki ham `**` ve backtick ekrana sızmasın.
    markup: async (message) => {
      output.messages.push(markupToPlain(message));
    },

    code: async (message) => {
      output.messages.push(message);
    },

    document: async (filename) => {
      output.attachments.push(`dosya: ${filename}`);
    },

    photo: async (_image, caption) => {
      output.attachments.push(caption ? `görsel: ${caption}` : "görsel");
    },

    video: async (_video, caption) => {
      output.attachments.push(caption ? `video: ${caption}` : "video");
    },

    progress: async (message): Promise<ProgressMessage> => {
      output.progress = message;
      return {
        update: async (text) => {
          output.progress = text;
        },
        remove: async () => {
          output.progress = undefined;
        },
      };
    },
  };
}
