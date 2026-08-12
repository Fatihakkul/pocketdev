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
  test("boş satırları atar, kenar boşluklarını kırpar", () => {
    const logs = new LogBuffer();
    logs.append("  ilk  \n\n   \nikinci\n");
    assert.equal(logs.tail(), "ilk\nikinci");
  });

  test("maxLines aşılınca en eski satırlar düşer", () => {
    const logs = new LogBuffer(3);
    logs.append("a\nb\nc\nd\ne\n");
    assert.equal(logs.tail(), "c\nd\ne");
  });

  test("tek chunk içindeki çok satır ayrı ayrı işlenir", () => {
    const logs = new LogBuffer();
    logs.append("bir\niki\nüç");
    assert.equal(logs.tail(2), "iki\nüç");
  });

  test("chunk sınırından bölünen satır tek parça kalır", () => {
    // Gerçek vaka (2026-08-12): xcodebuild'in dev clang komutu pipe tamponunda
    // tam `-W` ile `error=non-modular-include...` arasından bölündü. Kuyruk
    // birleştirilmezse ikinci parça ayrı bir satır sanılıyor ve Telegram'da
    // "error ..." diye başlayan sahte hata satırları görünüyordu.
    const logs = new LogBuffer();
    logs.append("clang -x c++ -W");
    logs.append("error=non-modular-include-in-framework-module -c dosya.cpp\n");
    assert.equal(logs.tail(), "clang -x c++ -Werror=non-modular-include-in-framework-module -c dosya.cpp");
  });

  test("bölünmüş parça sahte `error:` eşleşmesi üretmez", () => {
    const logs = new LogBuffer();
    logs.append("... -Wno-error");
    logs.append(": şey -c dosya.cpp\n");
    assert.deepEqual(logs.errors(), []);
  });

  test("gerçek hata satırı iki chunk'a bölünse de yakalanır", () => {
    const logs = new LogBuffer();
    logs.append("dosya.cpp:12:3: err");
    logs.append("or: use of undeclared identifier\n");
    assert.deepEqual(logs.errors(), ["dosya.cpp:12:3: error: use of undeclared identifier"]);
  });

  test("satır sonu görmeden biten çıktı kaybolmaz", () => {
    const logs = new LogBuffer();
    logs.append("son satır satır sonu yok");
    assert.equal(logs.tail(), "son satır satır sonu yok");
    assert.equal(logs.last(), "son satır satır sonu yok");
  });

  test("bekleyen kuyruk iki kez sayılmaz", () => {
    const logs = new LogBuffer();
    logs.append("yarım");
    logs.append(" tamam\n");
    assert.equal(logs.tail(), "yarım tamam");
  });
});

describe("LogBuffer.errors — RN CLI biçimi", () => {
  test("RN CLI'ın `error ` önekli satırları yakalanır", () => {
    // Gerçek vaka (2026-08-12): /localbuild'in asıl sebebi buydu ve eski filtre
    // yalnızca `error:` aradığı için hiç görünmüyordu.
    const logs = new LogBuffer();
    logs.append("error Duplicate plugin/preset detected.\n");
    logs.append("error Failed to build ios project. \"xcodebuild\" exited with error code '65'.\n");
    assert.equal(logs.errors().length, 2);
  });

  test("satır ortasındaki -Werror bayrakları hata sayılmaz", () => {
    const logs = new LogBuffer();
    logs.append("clang -Werror=return-type -Wno-error=shadow -c a.cpp\n");
    assert.deepEqual(logs.errors(), []);
  });

  test("clang hata satırı hâlâ yakalanır", () => {
    const logs = new LogBuffer();
    logs.append("a.cpp:1:1: error: bozuk\n");
    assert.deepEqual(logs.errors(), ["a.cpp:1:1: error: bozuk"]);
  });
});

describe("LogBuffer.last", () => {
  test("hiç satır yoksa undefined", () => {
    assert.equal(new LogBuffer().last(), undefined);
  });

  test("uzun satır kırpılıp elips eklenir", () => {
    const logs = new LogBuffer();
    logs.append("x".repeat(50));
    assert.equal(logs.last(10), `${"x".repeat(10)}…`);
  });

  test("sığan satır olduğu gibi döner", () => {
    const logs = new LogBuffer();
    logs.append("kısa");
    assert.equal(logs.last(10), "kısa");
  });
});

describe("LogBuffer.describe", () => {
  test("hata satırı varsa kuyruk yerine hatalar gösterilir", () => {
    const logs = new LogBuffer();
    logs.append("Compiling A\nerror: no such module 'RNGoogleMobileAds'\nCompiling B\n** ARCHIVE FAILED **\n");

    const output = logs.describe();
    assert.match(output, /^Hatalar:/);
    assert.match(output, /no such module/);
  });

  test("hata yoksa son loglar gösterilir", () => {
    const logs = new LogBuffer();
    logs.append("adım 1\nadım 2\n");

    const output = logs.describe();
    assert.match(output, /^Son loglar:/);
    assert.match(output, /adım 2/);
  });

  test("hata satırları en fazla 8 tane gösterilir", () => {
    const logs = new LogBuffer();
    for (let i = 1; i <= 12; i += 1) logs.append(`error: hata ${i}\n`);

    const body = logs.describe().replace("Hatalar:\n", "");
    assert.equal(body.split("\n").length, 8);
    assert.match(body, /hata 12/);
    assert.doesNotMatch(body, /hata 4\b/);
  });

  test("tam log dosyası varsa yolu eklenir", () => {
    const logs = new LogBuffer(100, "/tmp/telegram-bridge-test/archive.log");
    logs.append("adım\n");
    try {
      assert.match(logs.describe(), /Tam log: \/tmp\/telegram-bridge-test\/archive\.log$/);
    } finally {
      logs.close();
    }
  });

  test("dosya yolu yoksa ek satır da yok", () => {
    const logs = new LogBuffer();
    logs.append("adım\n");
    assert.doesNotMatch(logs.describe(), /Tam log:/);
  });
});
