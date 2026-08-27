import fs from "node:fs";
import path from "node:path";
import * as ipaExporter from "../platform/ios/ipaExporter.js";
import * as otaServer from "../platform/ios/otaServer.js";
import { getAdapter } from "../platform/adapter.js";
import { hasDevClient } from "../platform/expo/config.js";
import { m } from "../i18n/index.js";
import { RunLock, SessionStore } from "../core/runLock.js";

/** Tunnel'ı sonsuza kadar açık bırakmamak için üst sınır. */
const SESSION_TTL_MS = 60 * 60 * 1000;

export interface OtaBuildResult {
  installUrl: string;
  durationMs: number;
  expiresInMinutes: number;
  /** Bu build'de native proje yeniden üretildi mi (bağımlılık/plugin değişmişti). */
  prebuilt: boolean;
}

/** Yayındaki kurulum linki. `stop()` hem tüneli kapatır hem TTL sayacını söker. */
interface ServingSession {
  readonly publicUrl: string;
  stop(): Promise<void>;
}

const sessions = new SessionStore<ServingSession>();
const buildLock = new RunLock();

export function isBuilding(conversationId: number): boolean {
  return buildLock.isActive(conversationId);
}

export function isServing(conversationId: number): boolean {
  return sessions.has(conversationId);
}

export function getInstallUrl(conversationId: number): string | undefined {
  return sessions.get(conversationId)?.publicUrl;
}

/**
 * Release `.ipa` üretir ve telefondan kurulabilecek bir OTA linki döner.
 *
 * Sıra önemli: archive uzun süren adım (10-20dk), tunnel ise kısa ömürlü olmalı.
 * Ayrıca `manifest.plist` host'u içine sabit gömdüğü için export ancak tunnel
 * adresi bilindikten SONRA çalıştırılabiliyor. Bu yüzden akış
 * archive → tunnel → export şeklinde.
 */
export async function startOtaBuild(
  conversationId: number,
  projectPath: string,
  configuration: ipaExporter.BuildConfiguration,
  onProgress?: (elapsedMs: number, stage: string, lastLine?: string) => void
): Promise<OtaBuildResult> {
  return buildLock.run(conversationId, "Zaten bir OTA build sürüyor, lütfen bekle.", async () => {
    const startedAt = Date.now();
    const adapter = await getAdapter(projectPath);

    // En başta: dev launcher'sız bir Debug build /preview'a bağlanamaz, yani
    // komut vaat ettiği şeyi yapamaz. Aynı gerekçe imzalama profili ve tünel
    // ön kontrolleriyle aynı — 20 dakikalık archive'ı bekleyip sonunda
    // kullanılamaz bir build teslim etmek anlamsız.
    if (configuration === "Debug" && adapter.kind === "expo" && !hasDevClient(projectPath)) {
      throw new Error(m().runtime.devClientMissingForDebug);
    }

    const info = await adapter.readAppInfo(projectPath);
    const serveDir = path.join(projectPath, "build", "ota");

    // Archive'dan önce: bağımlılık ya da plugin değiştiyse native projeyi
    // eşitle. Atlanırsa build başarıyla geçer ama cihazda eksik modül patlar.
    const prebuilt = await adapter.syncNative(projectPath, (lastLine) =>
      onProgress?.(Date.now() - startedAt, "Native proje eşitleniyor", lastLine)
    );

    const target = ipaExporter.resolveXcodeTarget(projectPath);
    // Profili en başta çözüyoruz: hem archive'a takım kimliği gerekiyor, hem de
    // profil eksikse 20 dakikalık archive'ı bekleyip sonda patlamak anlamsız.
    // Profil yoksa ve App Store Connect anahtarı tanımlıysa burada otomatik
    // imzalamaya düşülüyor; profili Xcode export sırasında üretiyor.
    const signing = await ipaExporter.resolveSigning(info.bundleId);
    // Aynı gerekçe tünel için de geçerli — ve tünel archive'dan SONRA açıldığı
    // için burada kontrol edilmezse eksik tailnet ayarı ancak 4-5 dakikalık
    // archive bittikten sonra fark ediliyordu.
    await otaServer.preflight();

    const archivePath = await ipaExporter.archive(projectPath, target, configuration, signing, (lastLine) =>
      onProgress?.(Date.now() - startedAt, `${configuration} archive alınıyor`, lastLine)
    );

    onProgress?.(Date.now() - startedAt, "Tunnel açılıyor");
    await sessions.stop(conversationId); // önceki oturum varsa adresi geçersizleşiyor, kapat
    fs.rmSync(serveDir, { recursive: true, force: true });
    const session = await otaServer.start(
      serveDir,
      { appName: info.appName, version: info.version },
      (attempt, total) =>
        onProgress?.(Date.now() - startedAt, `Tunnel açılmadı, yeniden deneniyor (${attempt}/${total})`)
    );

    try {
      onProgress?.(Date.now() - startedAt, ".ipa export ediliyor");
      const exported = await ipaExporter.exportArchive(
        projectPath,
        archivePath,
        session.publicUrl,
        info.bundleId,
        signing
      );

      fs.copyFileSync(exported.ipaPath, path.join(serveDir, "app.ipa"));
      fs.copyFileSync(exported.manifestPath, path.join(serveDir, "manifest.plist"));
      await otaServer.generateIcons(info.iconPath, serveDir);
    } catch (error) {
      await session.stop();
      throw error;
    }

    // TTL sayacı oturumun kendi `stop`'unda söküyor: kullanıcı /otastop derse
    // sayaç da ölür, sayaç dolarsa oturum zaten kaydından düşmüş olur.
    const expiryTimer = setTimeout(() => void sessions.stop(conversationId), SESSION_TTL_MS);
    sessions.set(conversationId, {
      publicUrl: session.publicUrl,
      stop: async () => {
        clearTimeout(expiryTimer);
        await session.stop();
      },
    });

    return {
      installUrl: session.publicUrl,
      durationMs: Date.now() - startedAt,
      expiresInMinutes: SESSION_TTL_MS / 60_000,
      prebuilt,
    };
  });
}

export async function stop(conversationId: number): Promise<boolean> {
  return sessions.stop(conversationId);
}

export function stopAll(): void {
  sessions.stopAll();
}
