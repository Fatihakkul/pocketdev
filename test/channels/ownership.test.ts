import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decideAuth } from "../../src/channels/ownership.js";

/**
 * Yetkilendirme sessizce yanlış çalışabilecek türden bir mantık: gevşek kalırsa
 * yabancı botu ele geçirir, sıkı kalırsa sahip kendi botuna giremez. İkisi de
 * çalışırken fark edilmez, bu yüzden karar saf fonksiyona ayrıldı.
 */

const CODE = "123456";

describe("decideAuth — sahip belliyken", () => {
  test("sahibin mesajı geçiyor", () => {
    assert.deepEqual(
      decideAuth({ userId: 7, ownerId: 7, text: "merhaba", claimCode: CODE }),
      { kind: "allow" }
    );
  });

  test("yabancı sessizce yok sayılıyor", () => {
    assert.deepEqual(
      decideAuth({ userId: 8, ownerId: 7, text: "merhaba", claimCode: CODE }),
      { kind: "ignore" }
    );
  });

  test("yabancının doğru kodu bile sahipliği devralamıyor", () => {
    // Sahip belliyken /claim kapalı olmak zorunda: aksi halde kodu ele geçiren
    // biri çalışan bir kurulumu devralabilirdi.
    assert.deepEqual(
      decideAuth({ userId: 8, ownerId: 7, text: `/claim ${CODE}`, claimCode: CODE }),
      { kind: "ignore" }
    );
  });
});

describe("decideAuth — sahiplenilmemişken", () => {
  test("doğru kod sahipliği veriyor", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: `/claim ${CODE}`, claimCode: CODE }),
      { kind: "claim-ok", userId: 9 }
    );
  });

  test("bot adıyla yazılmış komut da çalışıyor", () => {
    // Gruplarda ve bazı istemcilerde Telegram komutu `/claim@botadi` diye gönderiyor.
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: `/claim@benimbot ${CODE}`, claimCode: CODE }),
      { kind: "claim-ok", userId: 9 }
    );
  });

  test("baştaki ve sondaki boşluk sorun değil", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: `  /claim ${CODE}  `, claimCode: CODE }),
      { kind: "claim-ok", userId: 9 }
    );
  });

  test("yanlış kod reddediliyor", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: "/claim 000000", claimCode: CODE }),
      { kind: "claim-bad" }
    );
  });

  test("kodsuz /claim reddediliyor", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: "/claim", claimCode: CODE }),
      { kind: "claim-bad" }
    );
  });

  test("/claim dışındaki hiçbir mesaj işlenmiyor", () => {
    // Sahiplenilmemiş bot, kodu bilmeyen birine hiçbir komutu çalıştırmamalı.
    for (const text of ["merhaba", "/help", "/otabuild", "/claimx 123456"]) {
      assert.deepEqual(
        decideAuth({ userId: 9, ownerId: undefined, text, claimCode: CODE }),
        { kind: "ignore" },
        `beklenmedik karar: ${text}`
      );
    }
  });

  test("metinsiz mesaj (fotoğraf, sticker) yok sayılıyor", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: undefined, claimCode: CODE }),
      { kind: "ignore" }
    );
  });

  test("kullanıcı kimliği yoksa yok sayılıyor", () => {
    assert.deepEqual(
      decideAuth({ userId: undefined, ownerId: undefined, text: `/claim ${CODE}`, claimCode: CODE }),
      { kind: "ignore" }
    );
  });
});
