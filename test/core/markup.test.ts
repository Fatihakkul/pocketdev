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
  test("escapes HTML special characters", () => {
    assert.equal(escapeHtml("<b>x</b>"), "&lt;b&gt;x&lt;/b&gt;");
  });

  test("& is escaped first, so nothing is double-escaped", () => {
    assert.equal(escapeHtml("a & <b>"), "a &amp; &lt;b&gt;");
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });
});

describe("markupToHtml", () => {
  test("code and bold are converted", () => {
    assert.equal(markupToHtml("`code` and **bold**"), "<code>code</code> and <b>bold</b>");
  });

  test("HTML in the content is escaped before conversion", () => {
    assert.equal(markupToHtml("`<script>`"), "<code>&lt;script&gt;</code>");
  });

  test("user HTML cannot pass through as a tag", () => {
    assert.equal(markupToHtml("<b>fake</b>"), "&lt;b&gt;fake&lt;/b&gt;");
  });

  test("several markup spans on one line", () => {
    assert.equal(markupToHtml("**a** and `b` and **c**"), "<b>a</b> and <code>b</code> and <b>c</b>");
  });

  test("an unmatched marker is left as-is", () => {
    assert.equal(markupToHtml("one ` backtick"), "one ` backtick");
    assert.equal(markupToHtml("two ** stars"), "two ** stars");
  });

  test("multi-line text is preserved", () => {
    assert.equal(markupToHtml("one\n`two`"), "one\n<code>two</code>");
  });
});

describe("markupToPlain", () => {
  test("strips the markup and keeps the text", () => {
    assert.equal(markupToPlain("`code` and **bold**"), "code and bold");
  });

  test("leaves HTML alone — no escaping", () => {
    assert.equal(markupToPlain("<b>x</b>"), "<b>x</b>");
  });
});
