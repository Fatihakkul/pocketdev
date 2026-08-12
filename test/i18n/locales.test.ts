import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LOCALES } from "../../src/i18n/index.js";

/**
 * Anahtar kümesinin eksiksizliğini zaten TİP SİSTEMİ garanti ediyor: `tr`,
 * `Messages` tipiyle bildirildiği için eksik ya da fazla anahtar derleme
 * hatası. Bu testlerin yakaladığı şey tipin göremediği kısım — boş bırakılmış
 * bir çeviri, ya da yer tutucusunu kullanmayı unutan bir fonksiyon.
 */

type Node = Record<string, unknown>;
type Fn = (...args: unknown[]) => string;

/** Sözlükteki fonksiyon yapraklarını `yol → fonksiyon` olarak toplar. */
function functionEntries(node: Node, prefix = ""): Array<[string, Fn]> {
  return Object.entries(node).flatMap(([key, value]): Array<[string, Fn]> => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "function") return [[path, value as Fn]];
    if (value && typeof value === "object") return functionEntries(value as Node, path);
    return [];
  });
}

/** Sözlüğü gezip her yaprağı `yol → üretilen metin` olarak düzleştirir. */
function flatten(node: Node, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.push([path, value]);
    } else if (typeof value === "function") {
      // Argümanları yer tutucuyla dolduruyoruz; amaç metnin üretilmesi.
      const args = Array.from({ length: value.length }, (_, i) => `<arg${i}>`);
      out.push([path, String((value as (...a: unknown[]) => string)(...args))]);
    } else if (value && typeof value === "object") {
      out.push(...flatten(value as Node, path));
    }
  }
  return out;
}

for (const [locale, dictionary] of Object.entries(LOCALES)) {
  describe(`sözlük: ${locale}`, () => {
    const entries = flatten(dictionary as unknown as Node);

    test("boş metin yok", () => {
      const empty = entries.filter(([, text]) => text.trim().length === 0).map(([path]) => path);
      assert.deepEqual(empty, [], `boş çeviri: ${empty.join(", ")}`);
    });

    test("her fonksiyon aldığı her argümanı metne koyuyor", () => {
      // Yer tutucuyu kullanmayı unutmak sessiz bir hata: mesaj gider ama bundle
      // id ya da asıl hata sebebi düşer, kullanıcı da neyin yanlış olduğunu
      // anlamaz.
      const dropped: string[] = [];
      for (const [path, value] of functionEntries(dictionary as unknown as Node)) {
        const args = Array.from({ length: value.length }, (_, i) => `<arg${i}>`);
        const text = String((value as (...a: unknown[]) => string)(...args));
        for (const arg of args) {
          if (!text.includes(arg)) dropped.push(`${path} (${arg})`);
        }
      }
      assert.deepEqual(dropped, [], `kullanılmayan argüman: ${dropped.join(", ")}`);
    });

    test("en az bir metin üretiliyor", () => {
      assert.ok(entries.length > 0);
    });
  });
}

describe("sözlükler arası tutarlılık", () => {
  test("iki dilde de aynı anahtar yolları var", () => {
    const paths = Object.values(LOCALES).map((d) => flatten(d as unknown as Node).map(([p]) => p).sort());
    const [first, ...rest] = paths;
    for (const other of rest) assert.deepEqual(other, first);
  });

  test("fonksiyonlar iki dilde de aynı sayıda argüman alıyor", () => {
    // Aksi halde bir dilde yer tutucu düşer ve kullanıcı eksik bilgi görür.
    const arity = (node: Node, prefix = ""): Array<[string, number]> =>
      Object.entries(node).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "function") return [[path, value.length] as [string, number]];
        if (value && typeof value === "object") return arity(value as Node, path);
        return [];
      });

    const perLocale = Object.values(LOCALES).map((d) =>
      arity(d as unknown as Node).sort((a, b) => a[0].localeCompare(b[0]))
    );
    const [first, ...rest] = perLocale;
    for (const other of rest) assert.deepEqual(other, first);
  });
});
