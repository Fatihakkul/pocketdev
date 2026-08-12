import { config } from "../config.js";
import { en, type Messages } from "./en.js";
import { tr } from "./tr.js";

export type { Messages } from "./en.js";

export const LOCALES = { en, tr };
export type Locale = keyof typeof LOCALES;

export function isLocale(value: string): value is Locale {
  return value in LOCALES;
}

/**
 * Etkin dilin sözlüğü.
 *
 * Varsayılan **İngilizce**: proje açık kaynak ve okuyucusunun büyük kısmı
 * Türkçe bilmiyor. Türkçe için `.env`'de `LOCALE=tr`.
 *
 * Her çağrıda bakılıyor, modül yüklenirken bir kez değil — böylece testler dili
 * değiştirebiliyor ve ileride konuşma başına dil eklemek tek satır kalıyor.
 */
export function m(): Messages {
  return LOCALES[config.locale];
}
