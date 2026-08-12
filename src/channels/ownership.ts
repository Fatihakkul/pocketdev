import crypto from "node:crypto";
import { config } from "../config.js";
import { getOwnerId } from "../core/state.js";

/**
 * Botun sahibini belirleme.
 *
 * Eskiden `ALLOWED_USER_ID` zorunluydu ve kullanıcı kendi sayısal Telegram
 * id'sini öğrenmek için üçüncü parti bir bota gitmek zorundaydı — kurulumdaki
 * en anlamsız sürtünme.
 *
 * **Neden "ilk mesajı atan sahip olur" değil.** Bot kullanıcı adları Telegram
 * aramasından bulunabiliyor; sahiplik ilk mesaja verilseydi, sen daha yazmadan
 * önce botu bulan biri onu sahiplenebilirdi. Bunun yerine süreç başlarken
 * konsola tek seferlik bir kod basılıyor ve sahiplik yalnızca `/claim <kod>`
 * ile alınabiliyor. Kodu görmek için makineye erişmek gerekiyor, yani güvenlik
 * bot token'ının gizliliğinden daha zayıf bir yere dayanmıyor.
 *
 * Kod diske yazılmıyor: her yeniden başlatmada yenisi üretiliyor.
 */
const claimCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

export function currentClaimCode(): string {
  return claimCode;
}

/** Yürürlükteki sahip: `.env` verilmişse o, yoksa `/claim` ile kaydedilmiş olan. */
export function currentOwnerId(): number | undefined {
  return config.allowedUserId ?? getOwnerId();
}

export type AuthDecision =
  /** Yetkili — komut işlensin. */
  | { kind: "allow" }
  /** Yetkisiz ya da anlamsız — sessizce yok sayılsın. */
  | { kind: "ignore" }
  /** Doğru kod geldi, bu kullanıcı sahip olarak kaydedilsin. */
  | { kind: "claim-ok"; userId: number }
  /** `/claim` geldi ama kod yanlış. */
  | { kind: "claim-bad" };

/**
 * Telegram komutları `/claim@botadi kod` biçiminde de gelebiliyor.
 *
 * Sondaki `(?:\s|$)` şart: iki grup da isteğe bağlı olduğu için o olmadan
 * `/claimx 123456` gibi BAŞKA bir komut da eşleşiyor ve "kod hatalı" yanıtı
 * alıyordu. Tanınmayan komut sessizce yok sayılmalı.
 */
const CLAIM_COMMAND = /^\/claim(?:@\S+)?(?:\s+(\S+))?(?:\s|$)/;

export interface AuthInput {
  userId: number | undefined;
  ownerId: number | undefined;
  text: string | undefined;
  claimCode: string;
}

/**
 * Bir mesajın işlenip işlenmeyeceğine karar verir.
 *
 * Süreçten ve Telegraf'tan ayrı saf fonksiyon: yetkilendirme, sessizce yanlış
 * çalışabilecek türden bir mantık olduğu için test edilebilir olması şart.
 */
export function decideAuth(input: AuthInput): AuthDecision {
  const { userId, ownerId, text, claimCode: expected } = input;
  if (userId === undefined) return { kind: "ignore" };

  if (ownerId !== undefined) {
    // Sahip belliyken `/claim` artık bir anlam taşımıyor; sahip devri elle
    // (data/state.json ya da .env) yapılıyor. Yabancıya da bir şey söylemiyoruz.
    return userId === ownerId ? { kind: "allow" } : { kind: "ignore" };
  }

  const match = text ? CLAIM_COMMAND.exec(text.trim()) : null;
  if (!match) return { kind: "ignore" };

  const given = match[1];
  // Sabit zamanlı karşılaştırma gereksiz: kod 6 hane ve her yeniden başlatmada
  // değişiyor, ayrıca yanlış denemenin maliyeti bir mesaj.
  if (!given || given !== expected) return { kind: "claim-bad" };

  return { kind: "claim-ok", userId };
}
