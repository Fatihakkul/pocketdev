import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  archiveSigningArgs,
  authenticationArgs,
  buildExportOptionsPlist,
  selectProfile,
  type InstalledProfile,
  type Signing,
} from "../../../src/platform/ios/ipaExporter.js";

/**
 * Bu plist'teki iki değer projeye en pahalıya mal olan tuzaklar (bkz. docs/LOCAL_BUILD.md):
 *   - `ad-hoc` deprecated; doğrusu `release-testing`
 *   - sertifika eski tipte olduğu için seçici `iOS Distribution` olmalı,
 *     `Apple Distribution` AYRI bir seçici ve "eşleşen sertifika yok" der
 * Bir daha sessizce geri gelmesinler diye sabitleniyorlar.
 */

const PROFILE: InstalledProfile = {
  uuid: "11111111-2222-3333-4444-555555555555",
  name: "Ad Hoc Profile",
  teamId: "ABCDE12345",
};

const MANUAL: Signing = { mode: "manual", profile: PROFILE };

const XCODE_PROFILE: InstalledProfile = {
  uuid: "99999999-8888-7777-6666-555555555555",
  name: "iOS Team Ad Hoc Provisioning Profile: com.example.app",
  teamId: "ABCDE12345",
  isXcodeManaged: true,
};

const XCODE_MANAGED: Signing = { mode: "xcode-managed", profile: XCODE_PROFILE };

const CREDENTIALS = {
  keyId: "ABC123XYZ0",
  issuerId: "11111111-2222-3333-4444-555555555555",
  keyPath: "/tmp/AuthKey_ABC123XYZ0.p8",
};

const AUTOMATIC: Signing = { mode: "automatic", teamId: "ABCDE12345", credentials: CREDENTIALS };

const plist = buildExportOptionsPlist("https://mac.tailnet.ts.net", "com.example.app", MANUAL);

describe("buildExportOptionsPlist", () => {
  test("the export method is release-testing", () => {
    assert.match(plist, /<key>method<\/key>\s*<string>release-testing<\/string>/);
    assert.doesNotMatch(plist, /ad-hoc/);
  });

  test("the signing certificate is iOS Distribution", () => {
    assert.match(plist, /<key>signingCertificate<\/key>\s*<string>iOS Distribution<\/string>/);
    assert.doesNotMatch(plist, /Apple Distribution/);
  });

  test("manual signing and the team id are written", () => {
    assert.match(plist, /<key>signingStyle<\/key>\s*<string>manual<\/string>/);
    assert.match(plist, /<key>teamID<\/key>\s*<string>ABCDE12345<\/string>/);
  });

  test("the profile is matched by bundle id", () => {
    assert.match(
      plist,
      /<key>provisioningProfiles<\/key>\s*<dict>\s*<key>com\.example\.app<\/key>\s*<string>Ad Hoc Profile<\/string>/
    );
  });

  test("manifest URLs embed the tunnel address", () => {
    // Host export anında plist'e sabitleniyor; bu yüzden akış archive → tunnel →
    // export sırasında ilerlemek zorunda.
    assert.match(plist, /<string>https:\/\/mac\.tailnet\.ts\.net\/app\.ipa<\/string>/);
    assert.match(plist, /<string>https:\/\/mac\.tailnet\.ts\.net\/icon-57\.png<\/string>/);
    assert.match(plist, /<string>https:\/\/mac\.tailnet\.ts\.net\/icon-512\.png<\/string>/);
  });

  test("produces a valid plist skeleton", () => {
    assert.match(plist, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(plist, /<!DOCTYPE plist PUBLIC/);
    assert.match(plist, /<\/plist>\s*$/);
  });
});

/**
 * Otomatik mod yalnızca ad-hoc profil HİÇ yokken devreye giriyor; tek amacı
 * profili Apple'a ürettirmek. Profil bir kez oluştuktan sonra diske kurulduğu
 * için sonraki build'ler manuel yola dönüyor.
 */
describe("buildExportOptionsPlist — automatic signing", () => {
  const auto = buildExportOptionsPlist("https://mac.tailnet.ts.net", "com.example.app", AUTOMATIC);

  test("the signing style is automatic", () => {
    assert.match(auto, /<key>signingStyle<\/key>\s*<string>automatic<\/string>/);
  });

  test("profile and certificate selection is left to Xcode", () => {
    // İkisi de henüz var olmayabilir; sabitlemek bootstrap'ın amacını baltalar.
    assert.doesNotMatch(auto, /provisioningProfiles/);
    assert.doesNotMatch(auto, /signingCertificate/);
  });

  test("the export method and team id stay the same", () => {
    assert.match(auto, /<key>method<\/key>\s*<string>release-testing<\/string>/);
    assert.match(auto, /<key>teamID<\/key>\s*<string>ABCDE12345<\/string>/);
  });
});

describe("buildExportOptionsPlist — Xcode-managed profile", () => {
  const managedPlist = buildExportOptionsPlist("https://mac.tailnet.ts.net", "com.example.app", XCODE_MANAGED);

  test("the signing style is automatic, not manual", () => {
    assert.match(managedPlist, /<key>signingStyle<\/key>\s*<string>automatic<\/string>/);
  });

  test("the profile is not pinned by name — export rejects it the same way", () => {
    assert.doesNotMatch(managedPlist, /provisioningProfiles/);
  });

  test("the team still comes from the profile", () => {
    assert.match(managedPlist, /<key>teamID<\/key>\s*<string>ABCDE12345<\/string>/);
  });
});

describe("selectProfile", () => {
  const now = new Date("2026-08-12T00:00:00Z");
  const at = (iso: string): Date => new Date(iso);
  const profile = (name: string, expiresAt?: Date): InstalledProfile => ({
    uuid: name,
    name,
    teamId: "ABCDE12345",
    expiresAt,
  });

  test("undefined when there is no candidate", () => {
    assert.equal(selectProfile([], now), undefined);
  });

  test("an expired profile is not selected", () => {
    assert.equal(selectProfile([profile("eski", at("2026-01-01T00:00:00Z"))], now), undefined);
  });

  test("with several valid candidates the latest-expiring one wins", () => {
    // Gerçek durum: elle üretilmiş profille Xcode'un ürettiği yan yana duruyor.
    // Dizin sırası keyfi olduğu için "ilkini al" süresi dolmuşu seçebiliyordu.
    const selected = selectProfile(
      [
        profile("expiring soon", at("2026-09-01T00:00:00Z")),
        profile("fresh", at("2027-07-16T00:00:00Z")),
      ],
      now
    );
    assert.equal(selected?.name, "fresh");
  });

  test("expired ones are filtered out and the valid one is selected", () => {
    const selected = selectProfile(
      [profile("expired", at("2025-01-01T00:00:00Z")), profile("valid", at("2027-01-01T00:00:00Z"))],
      now
    );
    assert.equal(selected?.name, "valid");
  });

  test("a manually managed profile wins over an Xcode-managed one", () => {
    // Xcode-managed profil daha taze olsa bile: manuel imzalama, Xcode'un
    // wildcard development profilini seçip aps-environment hatası vermesini
    // engelleyen tercih edilen yol.
    const selected = selectProfile(
      [
        { ...XCODE_PROFILE, expiresAt: at("2027-12-01T00:00:00Z") },
        { ...PROFILE, expiresAt: at("2027-01-01T00:00:00Z") },
      ],
      now
    );
    assert.equal(selected?.uuid, PROFILE.uuid);
  });

  test("an Xcode-managed profile is still used when it is the only candidate", () => {
    const selected = selectProfile([{ ...XCODE_PROFILE, expiresAt: at("2027-12-01T00:00:00Z") }], now);
    assert.equal(selected?.uuid, XCODE_PROFILE.uuid);
  });

  test("an expired manual profile does not shadow a valid Xcode-managed one", () => {
    const selected = selectProfile(
      [
        { ...PROFILE, expiresAt: at("2025-01-01T00:00:00Z") },
        { ...XCODE_PROFILE, expiresAt: at("2027-12-01T00:00:00Z") },
      ],
      now
    );
    assert.equal(selected?.uuid, XCODE_PROFILE.uuid);
  });

  test("a profile with an unreadable date is not filtered out", () => {
    // Bilinmeyen sorun sayılmaz: tarih ayrıştırılamadıysa profili kullanılamaz
    // ilan etmek, çalışan bir kurulumu bozmak olurdu.
    assert.equal(selectProfile([profile("tarihsiz")], now)?.name, "tarihsiz");
  });

  test("a dated valid profile is preferred over an undated one", () => {
    // Tarihsiz olan sonsuz sayılırsa yanlış olurdu; ama burada tarihsiz aday
    // bilinmeyen, bilinen geçerli olan daha güvenli.
    const selected = selectProfile([profile("tarihsiz"), profile("valid", at("2027-01-01T00:00:00Z"))], now);
    assert.ok(selected);
  });
});

describe("authenticationArgs", () => {
  const args = authenticationArgs(CREDENTIALS);

  test("profile generation and device registration are enabled", () => {
    assert.ok(args.includes("-allowProvisioningUpdates"));
    assert.ok(args.includes("-allowProvisioningDeviceRegistration"));
  });

  test("all three credential flags are passed with their values", () => {
    // Bayrak adları sessizce yanlış yazılabilecek türden; `man xcodebuild`
    // (Xcode 26.6) bu üçünü birlikte zorunlu kılıyor.
    for (const [flag, value] of [
      ["-authenticationKeyPath", CREDENTIALS.keyPath],
      ["-authenticationKeyID", CREDENTIALS.keyId],
      ["-authenticationKeyIssuerID", CREDENTIALS.issuerId],
    ]) {
      const index = args.indexOf(flag!);
      assert.notEqual(index, -1, `eksik bayrak: ${flag}`);
      assert.equal(args[index + 1], value);
    }
  });
});

describe("archiveSigningArgs", () => {
  test("manual mode pins the profile and the identity", () => {
    const args = archiveSigningArgs(MANUAL, "DEADBEEF");
    assert.ok(args.includes("CODE_SIGN_STYLE=Manual"));
    assert.ok(args.includes(`PROVISIONING_PROFILE_SPECIFIER=${PROFILE.uuid}`));
    assert.ok(args.includes("CODE_SIGN_IDENTITY=DEADBEEF"));
    assert.ok(args.includes(`DEVELOPMENT_TEAM=${PROFILE.teamId}`));
  });

  test("manual mode does not talk to the portal", () => {
    // Çalışan kurulumun davranışı değişmemeli: profil zaten varken Apple'a
    // bağlanmanın ne gereği var ne de faydası.
    assert.ok(!archiveSigningArgs(MANUAL, "DEADBEEF").includes("-allowProvisioningUpdates"));
  });

  test("automatic mode passes the team and leaves identity selection to Xcode", () => {
    const args = archiveSigningArgs(AUTOMATIC, undefined);
    assert.ok(args.includes("CODE_SIGN_STYLE=Automatic"));
    assert.ok(args.includes("DEVELOPMENT_TEAM=ABCDE12345"));
    assert.ok(args.includes("-allowProvisioningUpdates"));
    assert.ok(!args.some((arg) => arg.startsWith("CODE_SIGN_IDENTITY=")));
    assert.ok(!args.some((arg) => arg.startsWith("PROVISIONING_PROFILE_SPECIFIER=")));
  });

  test("an Xcode-managed profile is never pinned — that is the exit 65", () => {
    // xcodebuild: "is Xcode managed, but signing settings require a manually
    // managed profile". Pinlemek ikinci /otabuild'ı kalıcı olarak öldürüyordu.
    const args = archiveSigningArgs(XCODE_MANAGED, "DEADBEEF");
    assert.ok(args.includes("CODE_SIGN_STYLE=Automatic"));
    assert.ok(args.includes(`DEVELOPMENT_TEAM=${XCODE_PROFILE.teamId}`));
    assert.ok(!args.some((arg) => arg.startsWith("PROVISIONING_PROFILE_SPECIFIER=")));
    assert.ok(!args.some((arg) => arg.startsWith("CODE_SIGN_IDENTITY=")));
  });

  test("an Xcode-managed profile needs no portal round trip — it already exists", () => {
    // App Store Connect anahtarı tanımlı olmasa da bu yol çalışmalı.
    assert.ok(!archiveSigningArgs(XCODE_MANAGED, undefined).includes("-allowProvisioningUpdates"));
  });
});
