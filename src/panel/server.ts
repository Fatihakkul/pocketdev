import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commands, findCommand } from "../commands/registry.js";
import { webResponder, type WebOutput } from "../channels/web.js";
import { readEnv, updateEnv } from "../core/envFile.js";
import { chooseFolder } from "../core/folderPicker.js";
import * as jobs from "../core/jobs.js";
import * as state from "../core/state.js";
import { linkProject, listProjectsDetailed, unlinkProject } from "../core/workspace.js";

/**
 * Panel bot süreci içinde çalışıyor — tercih değil zorunluluk: çalışan
 * build/tunnel durumu runner'ların bellekteki Map'lerinde, ayrı bir süreç
 * bunları göremez (bkz. docs/WEB_UI.md).
 *
 * Yalnızca 127.0.0.1'e bağlanıyor. Kimlik doğrulaması yok; dışarı açmak
 * istenirse önce o eklenmeli.
 */
const DEFAULT_PORT = 4300;

/** Panelden tetiklenen komutların kullandığı sabit konuşma kimliği. */
const WEB_CONVERSATION_ID = 0;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function distDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}

/**
 * Aynı komuttan ikincisinin başlatılmasını engelliyor.
 *
 * Runner'ların kendi `isBuilding` kontrolleri konuşma kimliğine bakıyor;
 * panel ile Telegram farklı kimlikler kullandığından o kontroller tek başına
 * yetmez ve aynı proje iki kez derlenmeye başlayabilirdi.
 */
const runningCommands = new Set<string>();

async function runCommand(name: string, args: string[]): Promise<{ status: number; body: unknown }> {
  const command = findCommand(name);
  if (!command) return { status: 404, body: { error: `Bilinmeyen komut: ${name}` } };

  if (runningCommands.has(name)) {
    return { status: 409, body: { error: `${name} zaten çalışıyor.` } };
  }
  runningCommands.add(name);

  const output: WebOutput = { messages: [], attachments: [] };
  try {
    await command.run({
      conversationId: WEB_CONVERSATION_ID,
      args,
      raw: [`/${name}`, ...args].join(" "),
      channel: "web",
      respond: webResponder(output),
    });
    return { status: 200, body: output };
  } catch (error) {
    return { status: 500, body: { error: (error as Error).message, output } };
  } finally {
    runningCommands.delete(name);
  }
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  const urlPath = (req.url ?? "/").split("?")[0] ?? "/";
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");

  // Yol dosya sistemine çevrilmeden önce dist dışına çıkmadığı doğrulanıyor.
  const target = path.resolve(distDir(), relative);
  if (!target.startsWith(distDir())) {
    res.writeHead(403).end("forbidden");
    return;
  }

  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    const index = path.join(distDir(), "index.html");
    if (!fs.existsSync(index)) {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("Panel derlenmemiş. `cd web && npm install && npm run build` çalıştır.");
      return;
    }
    res.writeHead(200, { "content-type": MIME[".html"]! });
    fs.createReadStream(index).pipe(res);
    return;
  }

  res.writeHead(200, { "content-type": MIME[path.extname(target)] ?? "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

export function startWebPanel(port = Number(process.env.WEB_PORT ?? DEFAULT_PORT)): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = (req.url ?? "/").split("?")[0] ?? "/";

      if (url === "/api/state") {
        sendJson(res, 200, {
          activeJobs: jobs.activeJobs(),
          history: jobs.history(50),
          commands: commands.map((c) => ({ name: c.name, description: c.description, usage: c.usage })),
          projects: listProjectsDetailed(),
          activeProject: state.getActiveProject(WEB_CONVERSATION_ID),
          env: readEnv(),
          running: [...runningCommands],
        });
        return;
      }

      if (url === "/api/env" && req.method === "PUT") {
        const body = (await readBody(req)) as { changes?: Record<string, string> };
        updateEnv(body.changes ?? {});
        sendJson(res, 200, { ok: true, restartRequired: true, env: readEnv() });
        return;
      }

      // Klasör seçme diyaloğu Mac'te açılıyor ve kullanıcı seçene kadar bu
      // istek açık kalıyor; panel tarafında bunu bekleyen bir buton var.
      if (url === "/api/projects/pick" && req.method === "POST") {
        const picked = await chooseFolder();
        if (!picked) {
          sendJson(res, 200, { canceled: true });
          return;
        }
        sendJson(res, 200, { project: linkProject(picked) });
        return;
      }

      if (url === "/api/projects/link" && req.method === "POST") {
        const body = (await readBody(req)) as { path?: string };
        if (!body.path) {
          sendJson(res, 400, { error: "Klasör yolu gerekli." });
          return;
        }
        sendJson(res, 200, { project: linkProject(body.path) });
        return;
      }

      if (url === "/api/projects/unlink" && req.method === "POST") {
        const body = (await readBody(req)) as { name?: string };
        sendJson(res, 200, { ok: body.name ? unlinkProject(body.name) : false });
        return;
      }

      if (url.startsWith("/api/commands/") && req.method === "POST") {
        const name = decodeURIComponent(url.slice("/api/commands/".length));
        const body = (await readBody(req)) as { args?: string[] };
        const result = await runCommand(name, body.args ?? []);
        sendJson(res, result.status, result.body);
        return;
      }

      if (url.startsWith("/api/")) {
        sendJson(res, 404, { error: "not found" });
        return;
      }

      serveStatic(req, res);
    })().catch((error) => {
      sendJson(res, 500, { error: (error as Error).message });
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Web paneli: http://127.0.0.1:${port}`);
  });

  return server;
}
