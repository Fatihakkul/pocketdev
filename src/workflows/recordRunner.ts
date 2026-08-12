import { execa } from "execa";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RunLock } from "../core/runLock.js";
import { getAdapter } from "../platform/adapter.js";
import { m } from "../i18n/index.js";

const PREFERRED_DEVICES = ["iPhone 17", "iPhone 16", "iPhone SE (3rd generation)"];
const LAUNCH_TIMEOUT_MS = 6 * 60 * 1000; // ilk build native derleme içerdiği için yavaş olabilir
const RECORD_DURATION_MS = 8000;
const READY_SETTLE_MS = 3000; // uygulama render olsun diye ekstra bekleme

interface SimctlDevice {
  udid: string;
  name: string;
  state: string;
}

interface SimctlListResponse {
  devices: Record<string, SimctlDevice[]>;
}

const recordLock = new RunLock();

export function isRecording(conversationId: number): boolean {
  return recordLock.isActive(conversationId);
}

async function listDevices(filter: "booted" | "available"): Promise<SimctlDevice[]> {
  const { stdout } = await execa("xcrun", ["simctl", "list", "devices", filter, "-j"]);
  const data = JSON.parse(stdout) as SimctlListResponse;
  return Object.values(data.devices).flat();
}

async function ensureBootedSimulator(): Promise<string> {
  const booted = await listDevices("booted");
  const bootedIphone = booted.find((d) => d.name.startsWith("iPhone"));
  if (bootedIphone) return bootedIphone.udid;

  const available = await listDevices("available");
  for (const preferredName of PREFERRED_DEVICES) {
    const match = available.find((d) => d.name === preferredName);
    if (match) {
      await execa("xcrun", ["simctl", "boot", match.udid]);
      return match.udid;
    }
  }
  throw new Error(m().runtime.noSimulator);
}

export async function recordDemo(conversationId: number, projectPath: string): Promise<Buffer> {
  return recordLock.run(conversationId, "Zaten bir video kaydı sürüyor, lütfen bekle.", async () => {
    await ensureBootedSimulator();

    const adapter = await getAdapter(projectPath);
    const app = await adapter.runOnSimulator(projectPath);

    try {
      await app.waitUntilLaunched(LAUNCH_TIMEOUT_MS);
      await delay(READY_SETTLE_MS);

      const tmpFile = path.join(os.tmpdir(), `expo-demo-${Date.now()}.mp4`);
      const recorder = execa("xcrun", ["simctl", "io", "booted", "recordVideo", "--codec", "h264", tmpFile], {
        cleanup: true,
      });

      await delay(RECORD_DURATION_MS);
      // SIGINT: `recordVideo` dosyayı ancak kesme sinyalinde düzgün kapatıyor.
      recorder.kill("SIGINT");
      await recorder.catch(() => {});

      const buffer = await fs.readFile(tmpFile);
      await fs.unlink(tmpFile).catch(() => {});
      return buffer;
    } finally {
      await app.stop();
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
