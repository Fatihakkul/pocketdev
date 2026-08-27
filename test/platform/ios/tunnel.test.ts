import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describeTailscaleReadiness, type TailscaleStatus } from "../../../src/platform/ios/tunnel.js";

/**
 * Bu kontrolün varlık sebebi `/otabuild`'in sırası: archive → tunnel → export.
 * Tünel archive'dan sonra açıldığı için, eksik bir tailnet ayarı ancak 4-5
 * dakikalık archive bittikten sonra fark ediliyordu.
 *
 * Kritik tasarım kararı: bilinmeyen sorun sayılmaz. Yanlış pozitif bir ön
 * kontrol, çalışan bir kurulumu build'e hiç başlatmadan reddeder — bu, çözdüğü
 * sorundan daha kötü olurdu.
 */

const running = (self: TailscaleStatus["Self"]): TailscaleStatus => ({
  BackendState: "Running",
  Self: self,
});

/** Gerçek `tailscale status --json` çıktısından alınmış yetenek kümesi. */
const REAL_CAPS = {
  "default-auto-update": [true],
  funnel: null,
  https: null,
  "https://tailscale.com/cap/file-sharing": null,
  "https://tailscale.com/cap/funnel-ports?ports=443,8443,10000": null,
  "https://tailscale.com/cap/is-admin": null,
};

describe("describeTailscaleReadiness", () => {
  test("reports no problem on a running, Funnel-enabled machine", () => {
    const status = running({ DNSName: "makine.tailnet.ts.net.", CapMap: REAL_CAPS });
    assert.equal(describeTailscaleReadiness(status), undefined);
  });

  test("suggests `tailscale up` when not logged in", () => {
    const message = describeTailscaleReadiness({ BackendState: "NeedsLogin" });
    assert.match(message ?? "", /tailscale up/);
    // Durumu mesaja koymak şart: "Stopped" ile "NeedsLogin" farklı çözümler ister.
    assert.match(message ?? "", /NeedsLogin/);
  });

  test("reports a problem when BackendState is missing entirely", () => {
    assert.notEqual(describeTailscaleReadiness({}), undefined);
  });

  test("says the machine name is unavailable when MagicDNS is off", () => {
    const message = describeTailscaleReadiness(running({ CapMap: REAL_CAPS }));
    assert.match(message ?? "", /MagicDNS/);
  });

  test("points to the admin console when HTTPS certificates are off", () => {
    const { https: _omitted, ...withoutHttps } = REAL_CAPS;
    const message = describeTailscaleReadiness(running({ DNSName: "m.ts.net.", CapMap: withoutHttps }));
    assert.match(message ?? "", /HTTPS Certificates/);
  });

  test("points at nodeAttrs when Funnel permission is missing", () => {
    const { funnel: _omitted, ...withoutFunnel } = REAL_CAPS;
    const message = describeTailscaleReadiness(running({ DNSName: "m.ts.net.", CapMap: withoutFunnel }));
    assert.match(message ?? "", /nodeAttrs/);
  });

  test("a missing HTTPS setup is reported BEFORE Funnel", () => {
    // İkisi de eksikken sıra önemli: HTTPS sertifikası açılmadan Funnel izni tek
    // başına işe yaramıyor, yani kullanıcıya önce onu söylemek gerekiyor.
    const message = describeTailscaleReadiness(running({ DNSName: "m.ts.net.", CapMap: { "cap/x": null } }));
    assert.match(message ?? "", /HTTPS Certificates/);
  });

  test("the capability check is skipped when CapMap is absent", () => {
    // Eski tailscale sürümleri ya da alan adı değişikliği: bilinmeyen sorun
    // sayılırsa çalışan kurulum reddedilir.
    assert.equal(describeTailscaleReadiness(running({ DNSName: "m.ts.net." })), undefined);
  });
});
