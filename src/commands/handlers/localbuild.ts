import type { CommandContext } from "../../channels/channel.js";
import * as localBuildRunner from "../../workflows/localBuildRunner.js";
import * as jobs from "../../core/jobs.js";
import { requireActiveProject } from "./common.js";
import { m } from "../../i18n/index.js";

function formatMinutes(ms: number): string {
  return m().build.minutes(Math.round(ms / 60_000));
}

export async function handleLocalBuild(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  if (localBuildRunner.isBuilding(ctx.conversationId)) {
    await ctx.respond.text(m().build.localAlreadyRunning);
    return;
  }

  // Cihaz adları boşluk içerebiliyor ("Fatih iPhone'u"), o yüzden argümanları birleştiriyoruz.
  const search = ctx.args.join(" ").trim() || undefined;

  let device: localBuildRunner.AppleDevice;
  try {
    device = localBuildRunner.resolveDevice(await localBuildRunner.listConnectedDevices(), search);
  } catch (error) {
    await ctx.respond.text((error as Error).message);
    return;
  }

  const progress = await ctx.respond.progress(
    m().build.localStarted(device.name, device.osVersion)
  );

  const job = jobs.startJob({
    kind: "localbuild",
    label: device.name,
    project: project.name,
    channel: ctx.channel,
  });

  const updateProgress = (elapsedMs: number, lastLine?: string): void => {
    if (lastLine) job.progress(lastLine.slice(0, 200));
    void progress.update(
      m().build.localProgress(device.name, formatMinutes(elapsedMs)) + (lastLine ? `\n\n${lastLine}` : "")
    );
  };

  try {
    const result = await localBuildRunner.startLocalBuild(ctx.conversationId, project.path, device, updateProgress);
    job.succeed(m().build.localInstalled(result.device.name));
    await progress.remove();
    await ctx.respond.text(
      m().build.localReady(result.device.name, formatMinutes(result.durationMs))
    );
  } catch (error) {
    job.fail((error as Error).message);
    await progress.remove();
    await ctx.respond.text(m().build.localFailed((error as Error).message));
  }
}
