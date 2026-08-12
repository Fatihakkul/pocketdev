/**
 * `Responder.markup()` için minik bir işaretleme: satır içi `kod` ve **kalın**.
 *
 * Kanal bağımsız kalabilmesi için handler'lar HTML yazmıyor; her kanal bunu
 * kendi biçimine çeviriyor. Kaçış işlemi çeviriden ÖNCE yapılıyor, aksi halde
 * içerikteki `<` `>` karakterleri kanalın işaretlemesiyle karışır.
 */

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `kod` → <code>, **kalın** → <b>. Önce kaçış, sonra dönüşüm. */
export function markupToHtml(message: string): string {
  return escapeHtml(message)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

/** İşaretlemeyi söker; işaretlemeyi desteklemeyen yerlerde kullanılır. */
export function markupToPlain(message: string): string {
  return message.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}
