import type { CommandContext } from "../../channels/channel.js";
import QRCode from "qrcode";
import * as previewRunner from "../../workflows/previewRunner.js";
import { requireActiveProject } from "./common.js";
import { m } from "../../i18n/index.js";

export async function handlePreview(ctx: CommandContext): Promise<void> {
  const project = await requireActiveProject(ctx);
  if (!project) return;

  if (previewRunner.isRunning(ctx.conversationId)) {
    await ctx.respond.text(m().preview.alreadyRunning);
    return;
  }

  const progress = await ctx.respond.progress(
    m().preview.starting,
  );
  try {
    const { connectHint, serverUrl, clientName } = await previewRunner.start(
      ctx.conversationId,
      project.path,
      project.name,
    );
    await progress.remove();

    // ÖNEMLİ: URL'leri ASLA çıplak mesaj olarak gönderme. Telegram özel şemayı
    // (com.x.y://) tıklanabilir yapmaz ama içine gömülü tünel ALAN ADINI görüp
    // onu linkleştirir; kullanıcı ona dokununca uygulama değil, tarayıcı açılır
    // ve Metro'nun web sürümü (platform=web, hot=false) yüklenir — dev mode ve
    // fast refresh olmadan. <code> içinde gönderilenler linkleştirilmez.
    //
    // Deep link yalnızca Expo dev client'ta var; RN CLI'da tek yol dev menüsü,
    // o yüzden "Yol 1" ancak connectHint doluysa gösteriliyor.
    const manualStep = [
      m().preview.wayInAppHint(clientName),
      `\`${serverUrl}\``,
    ];
    const lines = connectHint
      ? [
          m().preview.doNotTapMulti,
          "",
          m().preview.waySafari,
          m().preview.waySafariHint,
          `\`${connectHint}\``,
          "",
          m().preview.wayInApp,
          ...manualStep,
        ]
      : [
          m().preview.doNotTapSingle,
          "",
          ...manualStep,
        ];
    await ctx.respond.markup([...lines, "", m().preview.stopHint].join("\n"));

    // Başka bir cihazdan (ör. simülatör ekranı) taramak isteyenler için QR da ekliyoruz.
    const qrBuffer = await QRCode.toBuffer(connectHint ?? serverUrl, { width: 400 });
    await ctx.respond.photo(qrBuffer, m().preview.qrCaption);
  } catch (error) {
    await progress.remove();
    await ctx.respond.text(m().preview.failed((error as Error).message));
  }
}
