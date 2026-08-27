import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decideAuth } from "../../src/channels/ownership.js";

/**
 * Yetkilendirme sessizce yanlış çalışabilecek türden bir mantık: gevşek kalırsa
 * yabancı botu ele geçirir, sıkı kalırsa sahip kendi botuna giremez. İkisi de
 * çalışırken fark edilmez, bu yüzden karar saf fonksiyona ayrıldı.
 */

const CODE = "123456";

describe("decideAuth — with a known owner", () => {
  test("the owner's message passes", () => {
    assert.deepEqual(
      decideAuth({ userId: 7, ownerId: 7, text: "merhaba", claimCode: CODE }),
      { kind: "allow" }
    );
  });

  test("a stranger is ignored silently", () => {
    assert.deepEqual(
      decideAuth({ userId: 8, ownerId: 7, text: "merhaba", claimCode: CODE }),
      { kind: "ignore" }
    );
  });

  test("even a correct code from a stranger cannot take over ownership", () => {
    // Sahip belliyken /claim kapalı olmak zorunda: aksi halde kodu ele geçiren
    // biri çalışan bir kurulumu devralabilirdi.
    assert.deepEqual(
      decideAuth({ userId: 8, ownerId: 7, text: `/claim ${CODE}`, claimCode: CODE }),
      { kind: "ignore" }
    );
  });
});

describe("decideAuth — before anyone has claimed it", () => {
  test("the correct code grants ownership", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: `/claim ${CODE}`, claimCode: CODE }),
      { kind: "claim-ok", userId: 9 }
    );
  });

  test("the command also works when written with the bot name", () => {
    // Gruplarda ve bazı istemcilerde Telegram komutu `/claim@botadi` diye gönderiyor.
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: `/claim@benimbot ${CODE}`, claimCode: CODE }),
      { kind: "claim-ok", userId: 9 }
    );
  });

  test("leading and trailing whitespace is not a problem", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: `  /claim ${CODE}  `, claimCode: CODE }),
      { kind: "claim-ok", userId: 9 }
    );
  });

  test("a wrong code is rejected", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: "/claim 000000", claimCode: CODE }),
      { kind: "claim-bad" }
    );
  });

  test("/claim without a code is rejected", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: "/claim", claimCode: CODE }),
      { kind: "claim-bad" }
    );
  });

  test("no message other than /claim is processed", () => {
    // Sahiplenilmemiş bot, kodu bilmeyen birine hiçbir komutu çalıştırmamalı.
    for (const text of ["merhaba", "/help", "/otabuild", "/claimx 123456"]) {
      assert.deepEqual(
        decideAuth({ userId: 9, ownerId: undefined, text, claimCode: CODE }),
        { kind: "ignore" },
        `beklenmedik karar: ${text}`
      );
    }
  });

  test("a message without text (photo, sticker) is ignored", () => {
    assert.deepEqual(
      decideAuth({ userId: 9, ownerId: undefined, text: undefined, claimCode: CODE }),
      { kind: "ignore" }
    );
  });

  test("a message without a user id is ignored", () => {
    assert.deepEqual(
      decideAuth({ userId: undefined, ownerId: undefined, text: `/claim ${CODE}`, claimCode: CODE }),
      { kind: "ignore" }
    );
  });
});
