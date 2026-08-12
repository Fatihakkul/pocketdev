/**
 * Kanal bağımsız komut katmanı.
 *
 * Handler'lar artık Telegraf'ı tanımıyor: bir `CommandContext` alıp `respond`
 * üzerinden cevap veriyorlar. Telegram bunun bir uygulaması; web paneli ve
 * ileride Discord/WhatsApp başka uygulamaları olacak.
 */

/** Gönderildikten sonra güncellenebilen/silinebilen ilerleme mesajı. */
export interface ProgressMessage {
  update(message: string): Promise<void>;
  remove(): Promise<void>;
}

export interface Responder {
  /** Düz metin. Kanal gerekiyorsa kendi boyut sınırına göre böler. */
  text(message: string): Promise<void>;

  /**
   * Satır içi `kod` ve **kalın** işaretlemesi olan metin.
   *
   * Ayrı bir metot olmasının sebebi Telegram'a özgü ama gerçek bir sorun:
   * çıplak gönderilen adresleri Telegram linkleştiriyor ve kullanıcı dokununca
   * uygulama yerine tarayıcı açılıyor. Kod olarak işaretlenenler linkleşmiyor.
   * Hangi kanalın nasıl render ettiği kanalın kendi bileceği iş.
   */
  markup(message: string): Promise<void>;

  /** Mesajın tamamı tek parça kod bloğu olarak. */
  code(message: string): Promise<void>;

  document(filename: string, content: string): Promise<void>;
  photo(image: Buffer, caption?: string): Promise<void>;
  video(video: Buffer, caption?: string): Promise<void>;

  progress(message: string): Promise<ProgressMessage>;
}

export type ChannelName = "telegram" | "web";

export interface CommandContext {
  /** Konuşma kimliği. Telegram'da chat id; web panelinde sabit yerel kimlik. */
  conversationId: number;
  /** Komut adından sonraki argümanlar. */
  args: string[];
  /** Serbest metin mesajlarında ham içerik. */
  raw: string;
  channel: ChannelName;
  respond: Responder;
}

export interface Command {
  name: string;
  /** /help ve panelde görünen açıklama. */
  description: string;
  /** Varsa argüman biçimi, ör. "<isim> [template]". */
  usage?: string;
  /** Aynı komuta bağlanan ek adlar; listelerde gösterilmez. */
  aliases?: string[];
  run(ctx: CommandContext): Promise<void>;
}
