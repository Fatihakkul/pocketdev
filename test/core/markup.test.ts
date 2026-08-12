import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { escapeHtml, markupToHtml, markupToPlain } from "../../src/core/markup.js";

/**
 * Kaçış, işaretleme dönüşümünden ÖNCE yapılmak zorunda: aksi halde build
 * loglarındaki `<` `>` karakterleri Telegram'ın HTML ayrıştırıcısını bozar ve
 * mesaj hiç gitmez. `/preview` çıktısındaki `<code>` blokları da bu yüzden
 * kritik — orada linkleşmemesi gereken tünel adresleri var.
 */

describe("escapeHtml", () => {
  test("HTML özel karakterlerini kaçırır", () => {
    assert.equal(escapeHtml("<b>x</b>"), "&lt;b&gt;x&lt;/b&gt;");
  });

  test("& önce kaçırılır, çift kaçış olmaz", () => {
    assert.equal(escapeHtml("a & <b>"), "a &amp; &lt;b&gt;");
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });
});

describe("markupToHtml", () => {
  test("kod ve kalın dönüşür", () => {
    assert.equal(markupToHtml("`kod` ve **kalın**"), "<code>kod</code> ve <b>kalın</b>");
  });

  test("içerikteki HTML dönüşümden önce kaçırılır", () => {
    assert.equal(markupToHtml("`<script>`"), "<code>&lt;script&gt;</code>");
  });

  test("kullanıcı HTML'i etiket olarak geçemez", () => {
    assert.equal(markupToHtml("<b>sahte</b>"), "&lt;b&gt;sahte&lt;/b&gt;");
  });

  test("birden çok işaretleme aynı satırda", () => {
    assert.equal(markupToHtml("**a** ve `b` ve **c**"), "<b>a</b> ve <code>b</code> ve <b>c</b>");
  });

  test("eşleşmeyen işaret olduğu gibi kalır", () => {
    assert.equal(markupToHtml("tek ` ters tırnak"), "tek ` ters tırnak");
    assert.equal(markupToHtml("tek ** yıldız"), "tek ** yıldız");
  });

  test("çok satırlı metin korunur", () => {
    assert.equal(markupToHtml("bir\n`iki`"), "bir\n<code>iki</code>");
  });
});

describe("markupToPlain", () => {
  test("işaretlemeyi söker, metni bırakır", () => {
    assert.equal(markupToPlain("`kod` ve **kalın**"), "kod ve kalın");
  });

  test("HTML'e dokunmaz — kaçış yok", () => {
    assert.equal(markupToPlain("<b>x</b>"), "<b>x</b>");
  });
});
