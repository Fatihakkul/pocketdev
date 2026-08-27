import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LogBuffer } from "../../src/core/processRunner.js";

/**
 * `describe()` bir build patladığında kullanıcının Telegram'da göreceği metni
 * üretiyor. Gerçek hata çıktının ortasında kalırken kuyrukta yalnızca
 * "** ARCHIVE FAILED **" görünüyordu; bu yüzden hata satırları öne alınıyor
 * (bkz. docs/LOCAL_BUILD.md'deki hata ayıklama notu).
 */

describe("LogBuffer.append", () => {
  test("drops blank lines and trims whitespace", () => {
    const logs = new LogBuffer();
    logs.append("  ilk  \n\n   \nikinci\n");
    assert.equal(logs.tail(), "ilk\nikinci");
  });

  test("the oldest lines fall off once maxLines is exceeded", () => {
    const logs = new LogBuffer(3);
    logs.append("a\nb\nc\nd\ne\n");
    assert.equal(logs.tail(), "c\nd\ne");
  });

  test("multiple lines in one chunk are handled separately", () => {
    const logs = new LogBuffer();
    logs.append("one\ntwo\nthree");
    assert.equal(logs.tail(2), "two\nthree");
  });

  test("a line split across a chunk boundary stays whole", () => {
    // Gerçek vaka (2026-08-12): xcodebuild'in dev clang komutu pipe tamponunda
    // tam `-W` ile `error=non-modular-include...` arasından bölündü. Kuyruk
    // birleştirilmezse ikinci parça ayrı bir satır sanılıyor ve Telegram'da
    // "error ..." diye başlayan sahte hata satırları görünüyordu.
    const logs = new LogBuffer();
    logs.append("clang -x c++ -W");
    logs.append("error=non-modular-include-in-framework-module -c dosya.cpp\n");
    assert.equal(logs.tail(), "clang -x c++ -Werror=non-modular-include-in-framework-module -c dosya.cpp");
  });

  test("a split fragment does not produce a false `error:` match", () => {
    const logs = new LogBuffer();
    logs.append("... -Wno-error");
    logs.append(": şey -c dosya.cpp\n");
    assert.deepEqual(logs.errors(), []);
  });

  test("a real error line is caught even when split across two chunks", () => {
    const logs = new LogBuffer();
    logs.append("dosya.cpp:12:3: err");
    logs.append("or: use of undeclared identifier\n");
    assert.deepEqual(logs.errors(), ["dosya.cpp:12:3: error: use of undeclared identifier"]);
  });

  test("output ending without a newline is not lost", () => {
    const logs = new LogBuffer();
    logs.append("last line without a newline");
    assert.equal(logs.tail(), "last line without a newline");
    assert.equal(logs.last(), "last line without a newline");
  });

  test("the pending tail is not counted twice", () => {
    const logs = new LogBuffer();
    logs.append("half");
    logs.append(" complete\n");
    assert.equal(logs.tail(), "half complete");
  });
});

describe("LogBuffer.errors — RN CLI format", () => {
  test("RN CLI lines prefixed with `error ` are caught", () => {
    // Gerçek vaka (2026-08-12): /localbuild'in asıl sebebi buydu ve eski filtre
    // yalnızca `error:` aradığı için hiç görünmüyordu.
    const logs = new LogBuffer();
    logs.append("error Duplicate plugin/preset detected.\n");
    logs.append("error Failed to build ios project. \"xcodebuild\" exited with error code '65'.\n");
    assert.equal(logs.errors().length, 2);
  });

  test("mid-line -Werror flags do not count as errors", () => {
    const logs = new LogBuffer();
    logs.append("clang -Werror=return-type -Wno-error=shadow -c a.cpp\n");
    assert.deepEqual(logs.errors(), []);
  });

  test("a clang error line is still caught", () => {
    const logs = new LogBuffer();
    logs.append("a.cpp:1:1: error: bozuk\n");
    assert.deepEqual(logs.errors(), ["a.cpp:1:1: error: bozuk"]);
  });
});

describe("LogBuffer.last", () => {
  test("undefined when there are no lines", () => {
    assert.equal(new LogBuffer().last(), undefined);
  });

  test("a long line is truncated with an ellipsis", () => {
    const logs = new LogBuffer();
    logs.append("x".repeat(50));
    assert.equal(logs.last(10), `${"x".repeat(10)}…`);
  });

  test("a line that fits is returned unchanged", () => {
    const logs = new LogBuffer();
    logs.append("short");
    assert.equal(logs.last(10), "short");
  });
});

describe("LogBuffer.describe", () => {
  test("errors are shown instead of the tail when there are error lines", () => {
    const logs = new LogBuffer();
    logs.append("Compiling A\nerror: no such module 'RNGoogleMobileAds'\nCompiling B\n** ARCHIVE FAILED **\n");

    const output = logs.describe();
    assert.match(output, /^Hatalar:/);
    assert.match(output, /no such module/);
  });

  test("the last log lines are shown when there are no errors", () => {
    const logs = new LogBuffer();
    logs.append("adım 1\nadım 2\n");

    const output = logs.describe();
    assert.match(output, /^Son loglar:/);
    assert.match(output, /adım 2/);
  });

  test("at most 8 error lines are shown", () => {
    const logs = new LogBuffer();
    for (let i = 1; i <= 12; i += 1) logs.append(`error: hata ${i}\n`);

    const body = logs.describe().replace("Hatalar:\n", "");
    assert.equal(body.split("\n").length, 8);
    assert.match(body, /hata 12/);
    assert.doesNotMatch(body, /hata 4\b/);
  });

  test("the full log path is appended when the file exists", () => {
    const logs = new LogBuffer(100, "/tmp/telegram-bridge-test/archive.log");
    logs.append("adım\n");
    try {
      assert.match(logs.describe(), /Tam log: \/tmp\/telegram-bridge-test\/archive\.log$/);
    } finally {
      logs.close();
    }
  });

  test("no extra line when there is no file path", () => {
    const logs = new LogBuffer();
    logs.append("adım\n");
    assert.doesNotMatch(logs.describe(), /Tam log:/);
  });
});
