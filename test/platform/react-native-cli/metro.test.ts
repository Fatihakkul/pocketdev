import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, test } from "node:test";
import { probeMetro } from "../../../src/platform/react-native-cli/metro.js";

/**
 * `/status` kontrolü `/preview`'ın en riskli yeri: yanlış cevap verirse ya
 * çalışan Metro "yok" sayılıp ikinci bir tane açılır, ya da başka bir projenin
 * sunucusu devralınıp telefona sessizce yanlış uygulama iner.
 *
 * Sahte sunucu, RN'in gerçek cevabını birebir taklit ediyor
 * (`community-cli-plugin/utils/isDevServerRunning`).
 */

let server: http.Server;
let port: number;
let respond: (res: http.ServerResponse) => void;

before(async () => {
  server = http.createServer((_req, res) => respond(res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("probeMetro", () => {
  test("returns the project root when Metro is running", async () => {
    respond = (res) => {
      res.setHeader("X-React-Native-Project-Root", "/Users/x/proje");
      res.end("packager-status:running");
    };
    assert.deepEqual(await probeMetro(port), {
      state: "running",
      projectRoot: "/Users/x/proje",
    });
  });

  test("empty string without the header — so the takeover check can still run", async () => {
    respond = (res) => res.end("packager-status:running");
    assert.deepEqual(await probeMetro(port), { state: "running", projectRoot: "" });
  });

  test("another server holding the port yields 'port-taken'", async () => {
    respond = (res) => res.end("<html>başka bir servis</html>");
    assert.deepEqual(await probeMetro(port), { state: "port-taken" });
  });

  test("'down' when nothing is listening", async () => {
    // Kapalı olduğu bilinen bir port: dinleyip hemen kapatıyoruz.
    const idle = http.createServer();
    await new Promise<void>((resolve) => idle.listen(0, "127.0.0.1", resolve));
    const freePort = (idle.address() as { port: number }).port;
    await new Promise<void>((resolve) => idle.close(() => resolve()));

    assert.deepEqual(await probeMetro(freePort), { state: "down" });
  });
});
