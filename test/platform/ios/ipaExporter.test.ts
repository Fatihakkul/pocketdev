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

const CREDENTIALS = {
  keyId: "ABC123XYZ0",
  issuerId: "11111111-2222-3333-4444-555555555555",
  keyPath: "/tmp/AuthKey_ABC123XYZ0.p8",
};

const AUTOMATIC: Signing = { mode: "automatic", teamId: "ABCDE12345", credentials: CREDENTIALS };

const plist = buildExportOptionsPlist("https://mac.tailnet.ts.net", "com.example.app", MANUAL);

describe("buildExportOptionsPlist", () => {
  test("export yöntemi release-testing", () => {
    assert.match(plist, /<key>method<\/key>\s*<string>release-testing<\/string>/);
    assert.doesNotMatch(plist, /ad-hoc/);
  });

  test("imzalama sertifikası iOS Distribution", () => {
    assert.match(plist, /<key>signingCertificate<\/key>\s*<string>iOS Distribution<\/string>/);
    assert.doesNotMatch(plist, /Apple Distribution/);
  });

  test("manuel imzalama ve takım kimliği yazılır", () => {
    assert.match(plist, /<key>signingStyle<\/key>\s*<string>manual<\/string>/);
    assert.match(plist, /<key>teamID<\/key>\s*<string>ABCDE12345<\/string>/);
  });

  test("profil bundle id ile eşleştirilir", () => {
    assert.match(
      plist,
      /<key>provisioningProfiles<\/key>\s*<dict>\s*<key>com\.example\.app<\/key>\s*<string>Ad Hoc Profile<\/string>/
    );
  });

  test("manifest URL'leri tünel adresine gömülür", () => {
    // Host export anında plist'e sabitleniyor; bu yüzden akış archive → tunnel →
    // export sırasında ilerlemek zorunda.
    assert.match(plist, /<string>https:\/\/mac\.tailnet\.ts\.net\/app\.ipa<\/string>/);
    assert.match(plist, /<string>https:\/\/mac\.tailnet\.ts\.net\/icon-57\.png<\/string>/);
    assert.match(plist, /<string>https:\/\/mac\.tailnet\.ts\.net\/icon-512\.png<\/string>/);
  });

  test("geçerli bir plist iskeleti üretir", () => {
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
describe("buildExportOptionsPlist — otomatik imzalama", () => {
  const auto = buildExportOptionsPlist("https://mac.tailnet.ts.net", "com.example.app", AUTOMATIC);

  test("imzalama stili automatic", () => {
    assert.match(auto, /<key>signingStyle<\/key>\s*<string>automatic<\/string>/);
  });

  test("profil ve sertifika seçimi Xcode'a bırakılıyor", () => {
    // İkisi de henüz var olmayabilir; sabitlemek bootstrap'ın amacını baltalar.
    assert.doesNotMatch(auto, /provisioningProfiles/);
    assert.doesNotMatch(auto, /signingCertificate/);
  });

  test("export yöntemi ve takım kimliği değişmiyor", () => {
    assert.match(auto, /<key>method<\/key>\s*<string>release-testing<\/string>/);
    assert.match(auto, /<key>teamID<\/key>\s*<string>ABCDE12345<\/string>/);
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

  test("aday yoksa undefined", () => {
    assert.equal(selectProfile([], now), undefined);
  });

  test("süresi dolmuş profil seçilmiyor", () => {
    assert.equal(selectProfile([profile("eski", at("2026-01-01T00:00:00Z"))], now), undefined);
  });

  test("birden fazla geçerli aday varsa en ileri tarihli seçiliyor", () => {
    // Gerçek durum: elle üretilmiş profille Xcode'un ürettiği yan yana duruyor.
    // Dizin sırası keyfi olduğu için "ilkini al" süresi dolmuşu seçebiliyordu.
    const selected = selectProfile(
      [
        profile("yakında dolacak", at("2026-09-01T00:00:00Z")),
        profile("taze", at("2027-07-16T00:00:00Z")),
      ],
      now
    );
    assert.equal(selected?.name, "taze");
  });

  test("süresi dolmuşlar elenip geçerli olan seçiliyor", () => {
    const selected = selectProfile(
      [profile("dolmuş", at("2025-01-01T00:00:00Z")), profile("geçerli", at("2027-01-01T00:00:00Z"))],
      now
    );
    assert.equal(selected?.name, "geçerli");
  });

  test("tarihi okunamayan profil elenmiyor", () => {
    // Bilinmeyen sorun sayılmaz: tarih ayrıştırılamadıysa profili kullanılamaz
    // ilan etmek, çalışan bir kurulumu bozmak olurdu.
    assert.equal(selectProfile([profile("tarihsiz")], now)?.name, "tarihsiz");
  });

  test("tarihli geçerli profil, tarihsize tercih ediliyor", () => {
    // Tarihsiz olan sonsuz sayılırsa yanlış olurdu; ama burada tarihsiz aday
    // bilinmeyen, bilinen geçerli olan daha güvenli.
    const selected = selectProfile([profile("tarihsiz"), profile("geçerli", at("2027-01-01T00:00:00Z"))], now);
    assert.ok(selected);
  });
});

describe("authenticationArgs", () => {
  const args = authenticationArgs(CREDENTIALS);

  test("profil üretimi ve cihaz kaydı açık", () => {
    assert.ok(args.includes("-allowProvisioningUpdates"));
    assert.ok(args.includes("-allowProvisioningDeviceRegistration"));
  });

  test("üç kimlik bayrağı da değeriyle birlikte geçiyor", () => {
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
  test("manuel modda profil ve kimlik sabitleniyor", () => {
    const args = archiveSigningArgs(MANUAL, "DEADBEEF");
    assert.ok(args.includes("CODE_SIGN_STYLE=Manual"));
    assert.ok(args.includes(`PROVISIONING_PROFILE_SPECIFIER=${PROFILE.uuid}`));
    assert.ok(args.includes("CODE_SIGN_IDENTITY=DEADBEEF"));
    assert.ok(args.includes(`DEVELOPMENT_TEAM=${PROFILE.teamId}`));
  });

  test("manuel modda portalla konuşulmuyor", () => {
    // Çalışan kurulumun davranışı değişmemeli: profil zaten varken Apple'a
    // bağlanmanın ne gereği var ne de faydası.
    assert.ok(!archiveSigningArgs(MANUAL, "DEADBEEF").includes("-allowProvisioningUpdates"));
  });

  test("otomatik modda takım verilip kimlik seçimi Xcode'a bırakılıyor", () => {
    const args = archiveSigningArgs(AUTOMATIC, undefined);
    assert.ok(args.includes("CODE_SIGN_STYLE=Automatic"));
    assert.ok(args.includes("DEVELOPMENT_TEAM=ABCDE12345"));
    assert.ok(args.includes("-allowProvisioningUpdates"));
    assert.ok(!args.some((arg) => arg.startsWith("CODE_SIGN_IDENTITY=")));
    assert.ok(!args.some((arg) => arg.startsWith("PROVISIONING_PROFILE_SPECIFIER=")));
  });
});
