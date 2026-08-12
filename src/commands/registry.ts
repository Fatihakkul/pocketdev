import type { Command } from "../channels/channel.js";
import { handleNew } from "./handlers/new.js";
import { handleTemplates } from "./handlers/templates.js";
import { handleProjects } from "./handlers/projects.js";
import { handleUse } from "./handlers/use.js";
import { handleNewChat } from "./handlers/newchat.js";
import { handleEndChat } from "./handlers/endchat.js";
import { handlePreview } from "./handlers/preview.js";
import { handleStopPreview } from "./handlers/stoppreview.js";
import { handleRecord } from "./handlers/record.js";
import { handleQaBuild } from "./handlers/qabuild.js";
import { handleDevBuild } from "./handlers/devbuild.js";
import { handleLocalBuild } from "./handlers/localbuild.js";
import { handleOtaBuild, handleOtaLink, handleOtaStop } from "./handlers/ota.js";
import { handleLs, handleMkdir, handlePwd } from "./handlers/fs.js";
import { handleDiff } from "./handlers/diff.js";
import { handleModel } from "./handlers/model.js";
import { handleUsage } from "./handlers/usage.js";
import { handleHelp } from "./handlers/help.js";
import { handleDoctor } from "./handlers/doctor.js";
import { m } from "../i18n/index.js";

/**
 * Tüm komutların tek kaynağı.
 *
 * Kanallar (Telegram, web paneli, ileride Discord/WhatsApp) bu listeyi okuyup
 * kendi bağlamalarını kuruyor. Yeni komut eklemek için buraya bir satır yetiyor;
 * her kanala ayrı ayrı eklemek gerekmiyor. Panelin komut listesi de buradan
 * beslenecek — elle yazılmış yardım metninden değil.
 *
 * Açıklamalar ve kullanım biçimleri `get` ile tanımlı, düz alan olarak değil:
 * bu dizi modül yüklenirken bir kez kuruluyor ve düz alan olsalardı dil o anda
 * donardı — `m()`'in "her çağrıda bak" davranışı burada kaybolur, konuşma
 * başına dil gibi bir şey ileride eklenemezdi. Getter, `Command` arayüzünü hiç
 * değiştirmeden geç bağlama sağlıyor.
 */
export const commands: Command[] = [
  // /start Telegram'ın yeni sohbette gösterdiği komut; /help ile aynı işi yapar.
  { name: "help", get description() { return m().commands.help; }, aliases: ["start"], run: handleHelp },
  {
    name: "new",
    get description() { return m().commands.new; },
    get usage() { return m().commands.newUsage; },
    run: handleNew,
  },
  { name: "templates", get description() { return m().commands.templates; }, run: handleTemplates },
  { name: "projects", get description() { return m().commands.projects; }, run: handleProjects },
  {
    name: "use",
    get description() { return m().commands.use; },
    get usage() { return m().commands.useUsage; },
    run: handleUse,
  },
  { name: "newchat", get description() { return m().commands.newchat; }, run: handleNewChat },
  { name: "endchat", get description() { return m().commands.endchat; }, run: handleEndChat },
  { name: "preview", get description() { return m().commands.preview; }, run: handlePreview },
  { name: "stop", get description() { return m().commands.stop; }, run: handleStopPreview },
  { name: "record", get description() { return m().commands.record; }, run: handleRecord },
  { name: "qabuild", get description() { return m().commands.qabuild; }, run: handleQaBuild },
  { name: "devbuild", get description() { return m().commands.devbuild; }, run: handleDevBuild },
  {
    name: "localbuild",
    get description() { return m().commands.localbuild; },
    get usage() { return m().commands.localbuildUsage; },
    run: handleLocalBuild,
  },
  {
    name: "otabuild",
    get description() { return m().commands.otabuild; },
    get usage() { return m().commands.otabuildUsage; },
    run: handleOtaBuild,
  },
  { name: "otalink", get description() { return m().commands.otalink; }, run: handleOtaLink },
  { name: "otastop", get description() { return m().commands.otastop; }, run: handleOtaStop },
  { name: "pwd", get description() { return m().commands.pwd; }, run: handlePwd },
  {
    name: "ls",
    get description() { return m().commands.ls; },
    get usage() { return m().commands.lsUsage; },
    run: handleLs,
  },
  {
    name: "mkdir",
    get description() { return m().commands.mkdir; },
    get usage() { return m().commands.mkdirUsage; },
    run: handleMkdir,
  },
  {
    name: "diff",
    get description() { return m().commands.diff; },
    get usage() { return m().commands.diffUsage; },
    run: handleDiff,
  },
  {
    name: "model",
    get description() { return m().commands.model; },
    get usage() { return m().commands.modelUsage; },
    run: handleModel,
  },
  { name: "usage", get description() { return m().commands.usage; }, run: handleUsage },
  { name: "doctor", get description() { return m().commands.doctor; }, run: handleDoctor },
];

export function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name || command.aliases?.includes(name));
}
