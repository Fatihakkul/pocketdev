import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parseDeviceList,
  resolveDevice,
  type AppleDevice,
  type DeviceScan,
} from "../../src/workflows/localBuildRunner.js";
import { m } from "../../src/i18n/index.js";

/**
 * Kaynak `xcrun xcdevice list` (bkz. localBuildRunner'daki gerekçe): `xctrace`
 * kabloyla bağlı bir cihazı "offline" gösterebiliyor ve bot çalışabilir cihaza
 * "bağlı cihaz yok" diyordu. Ayrıştırmanın yanlış kaydı seçmesi ise "cihaz
 * bulunamadı" ya da yanlış cihaza kurulum demek.
 */

/** Gerçek `xcdevice list` çıktısından alınmış kayıtlar (2026-08-12). */
const SAMPLE = JSON.stringify([
  {
    ignored: false,
    simulator: false,
    modelName: "iPhone 11",
    operatingSystemVersion: "18.6.2 (22G100)",
    identifier: "00008030-001234567890ABCD",
    platform: "com.apple.platform.iphoneos",
    interface: "usb",
    available: true,
    name: "Ornek iPhone",
  },
  {
    ignored: false,
    simulator: false,
    identifier: "00006000-000000000000AAAA",
    platform: "com.apple.platform.macosx",
    available: true,
    name: "Ornek Mac",
  },
  {
    ignored: false,
    simulator: true,
    operatingSystemVersion: "26.0",
    identifier: "A1B2C3D4-1111-2222-3333-444455556666",
    platform: "com.apple.platform.iphonesimulator",
    available: true,
    name: "iPhone 17 Pro",
  },
  {
    ignored: false,
    simulator: false,
    operatingSystemVersion: "17.4 (21E219)",
    identifier: "00008103-000B55667788001E",
    platform: "com.apple.platform.iphoneos",
    available: false,
    error: { description: "iPad is locked." },
    name: "Ornek iPad",
  },
]);

describe("parseDeviceList", () => {
  test("only available physical iPhones and iPads", () => {
    assert.deepEqual(
      parseDeviceList(SAMPLE).available.map((d) => d.name),
      ["Ornek iPhone"]
    );
  });

  test("name, version and UDID parse correctly; the build number is dropped", () => {
    const [iphone] = parseDeviceList(SAMPLE).available;
    assert.deepEqual(iphone, {
      name: "Ornek iPhone",
      osVersion: "18.6.2",
      udid: "00008030-001234567890ABCD",
    });
  });

  test("the UDID is in the classic hardware form — the only one Expo and RN CLI match", () => {
    const [iphone] = parseDeviceList(SAMPLE).available;
    assert.match(iphone!.udid, /^000080\d\d-/);
  });

  test("Macs and simulators are filtered out", () => {
    const { available } = parseDeviceList(SAMPLE);
    assert.equal(available.some((d) => d.name.includes("Mac")), false);
    assert.equal(available.some((d) => d.name.startsWith("iPhone 17")), false);
  });

  test("an unavailable device goes in a separate list with its reason", () => {
    const { unavailable } = parseDeviceList(SAMPLE);
    assert.deepEqual(unavailable, [
      {
        name: "Ornek iPad",
        osVersion: "17.4",
        udid: "00008103-000B55667788001E",
        reason: "iPad is locked.",
      },
    ]);
  });

  test("a placeholder when no reason is reported", () => {
    const stdout = JSON.stringify([
      {
        simulator: false,
        platform: "com.apple.platform.iphoneos",
        identifier: "00008030-X",
        name: "Sessiz iPhone",
        available: false,
      },
    ]);
    assert.equal(parseDeviceList(stdout).unavailable[0]?.reason, "sebep bildirilmedi");
  });

  test("unexpected output does not crash it", () => {
    const empty: DeviceScan = { available: [], unavailable: [] };
    assert.deepEqual(parseDeviceList(""), empty);
    assert.deepEqual(parseDeviceList("xcrun: error: unable to find utility"), empty);
    assert.deepEqual(parseDeviceList("[]"), empty);
    // Dizi değil ama geçerli JSON
    assert.deepEqual(parseDeviceList('{"devices":[]}'), empty);
  });
});

const IPHONE: AppleDevice = { name: "Ornek iPhone", osVersion: "18.6.2", udid: "00008030-AAA" };
const IPAD: AppleDevice = { name: "iPad", osVersion: "17.4", udid: "00008103-BBB" };

const scan = (available: AppleDevice[], unavailable: DeviceScan["unavailable"] = []): DeviceScan => ({
  available,
  unavailable,
});

describe("resolveDevice", () => {
  test("no search needed when there is a single device", () => {
    assert.equal(resolveDevice(scan([IPHONE])).udid, IPHONE.udid);
  });

  test("throws an actionable error when there is no device", () => {
    assert.throws(() => resolveDevice(scan([])), /Bağlı iOS cihazı bulunamadı/);
  });

  test("shows Xcode's reason when a device is unavailable", () => {
    assert.throws(
      () => resolveDevice(scan([], [{ ...IPHONE, reason: "iPhone is locked." }])),
      (error: Error) => {
        assert.match(error.message, /Görünen ama kullanılamayan cihazlar/);
        assert.match(error.message, /Ornek iPhone: iPhone is locked\./);
        return true;
      }
    );
  });

  test("asks for a choice and lists them all when there are several devices", () => {
    assert.throws(() => resolveDevice(scan([IPHONE, IPAD])), (error: Error) => {
      assert.match(error.message, /Birden fazla cihaz bağlı/);
      assert.match(error.message, /Ornek iPhone \(18\.6\.2\)/);
      assert.match(error.message, /iPad \(17\.4\)/);
      return true;
    });
  });

  test("matches by name, case-insensitively", () => {
    assert.equal(resolveDevice(scan([IPHONE, IPAD]), "IPAD").udid, IPAD.udid);
    assert.equal(resolveDevice(scan([IPHONE, IPAD]), "iPad").udid, IPAD.udid);
  });

  test("KNOWN LIMITATION: a name written with the Turkish dotted İ does not match", () => {
    // "İ".toLowerCase() birleşik noktalı "i̇" üretiyor, düz "i" değil; bu yüzden
    // kullanıcı cihaz adını Türkçe büyük harfle yazarsa eşleşme kaçıyor.
    // Davranış bilerek değiştirilmedi: UDID ve olduğu gibi yazılan isim çalışıyor.
    assert.throws(() => resolveDevice(scan([IPHONE]), "FATİH IPHONE'U"), (error: Error) => {
      assert.ok(error.message.startsWith(m().runtime.noMatchingDevice("FATİH IPHONE'U", "").trim().split("\n")[0]!));
      return true;
    });
  });

  test("matches by UDID", () => {
    assert.equal(resolveDevice(scan([IPHONE, IPAD]), "00008103-bbb").udid, IPAD.udid);
  });

  test("lists the connected devices in the error when nothing matches", () => {
    assert.throws(() => resolveDevice(scan([IPHONE]), "olmayan"), (error: Error) => {
      assert.ok(error.message.includes(m().runtime.noMatchingDevice("olmayan", "").split("\n")[0]!));
      assert.match(error.message, /Ornek iPhone/);
      return true;
    });
  });
});
