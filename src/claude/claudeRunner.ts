import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import * as state from "../core/state.js";
import { ALLOWED_WEB_DOMAINS, buildPolicy } from "./sandbox.js";
import { m } from "../i18n/index.js";

/**
 * Alt sürece geçirilecek ortam değişkenleri — bilinçli olarak ALLOWLIST.
 *
 * Önceden `process.env` olduğu gibi miras kalıyordu, yani `BOT_TOKEN` her
 * Claude oturumunun ortamında duruyordu. Denylist yazmak yetmez: bota sonradan
 * eklenen her yeni sır sessizce sızardı.
 *
 * `SSH_AUTH_SOCK` kasıtlı olarak yok — geçseydi, `~/.ssh` okunamasa bile
 * ajan üzerinden anahtarlarla imzalama/kimlik doğrulama yapılabilirdi.
 */
const INHERITED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
];

/** CLI'ın kendi yapılandırması ve kimlik doğrulaması için gereken önekler. */
const INHERITED_ENV_PREFIXES = ["ANTHROPIC_", "CLAUDE_"];

export function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (INHERITED_ENV_KEYS.includes(key) || INHERITED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      env[key] = value;
    }
  }
  return env;
}

const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000;

const RULES_FILE = path.resolve(process.cwd(), "RULES.md");

function loadProjectRules(): string {
  try {
    return fs.readFileSync(RULES_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

// RULES.md'yi her çalıştırmada (--resume ile devam eden session'larda dahil)
// yeniden okuyoruz ki dosyayı güncelleyince kod değişikliği/deploy gerekmeden
// devreye girsin.
function loadRulesSystemNote(): string {
  const rules = loadProjectRules();
  return rules ? `Aşağıdaki proje kurallarına kesinlikle uy:\n\n${rules}` : "";
}

const WEB_ACCESS_SYSTEM_NOTE = `İnternet erişimin sadece belirli sitelerden sayfa OKUMA (WebFetch) ile sınırlı, genel web araması (WebSearch) yapamazsın. Erişebildiğin domainler: ${ALLOWED_WEB_DOMAINS.join(", ")}. Kullanıcı bu listede olmayan bir siteye ihtiyaç duyarsa, o siteye erişimin olmadığını açıkça söyle ve gerekirse listeye eklenmesini iste; sessizce reddedilen bir isteği tekrar tekrar deneme.`;

interface ClaudeJsonResult {
  is_error: boolean;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  subtype?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, { costUSD?: number; canonicalModel?: string }>;
}

function pickPrimaryModel(modelUsage: ClaudeJsonResult["modelUsage"]): string | undefined {
  if (!modelUsage) return undefined;
  const entries = Object.entries(modelUsage);
  if (entries.length === 0) return undefined;
  const [name, primary] = entries.reduce((best, current) =>
    (current[1]?.costUSD ?? 0) > (best[1]?.costUSD ?? 0) ? current : best
  );
  return primary?.canonicalModel ?? name;
}

export interface ClaudeRunResult {
  text: string;
  isError: boolean;
  /**
   * Bu cevap, konuşma geçmişi kaybedildikten sonra SIFIRDAN üretildiyse true.
   * Kullanıcıya söylenmesi şart: sessiz amnezi, farkında olmadan yanlış
   * varsayımlarla devam etmek demek.
   */
  historyReset?: boolean;
}

// Only one claude invocation per conversation at a time, to avoid session/state races.
const busyConversations = new Set<number>();

export function isBusy(conversationId: number): boolean {
  return busyConversations.has(conversationId);
}

/**
 * `--resume` gerçekten bayat bir oturum yüzünden mi patladı?
 *
 * Zaman aşımı ve sinyalle sonlandırma oturumun bozuk olduğunu GÖSTERMEZ; koşu
 * yarıda kalmıştır, o kadar. Bu ayrım olmadan her deploy (süreç yeniden
 * başlatılırken çocuk süreç öldürülüyor) ve 10 dakikayı aşan her uzun görev
 * kullanıcının konuşma geçmişini siliyordu.
 */
export function looksLikeStaleSession(error: unknown): boolean {
  const e = error as { timedOut?: boolean; isTerminated?: boolean; signal?: string };
  return !e?.timedOut && !e?.isTerminated && !e?.signal;
}

export async function run(
  conversationId: number,
  projectPath: string,
  projectName: string,
  prompt: string,
  /** İç kullanım: oturum sıfırlandıktan sonraki tekrar denemede true. */
  afterHistoryReset = false
): Promise<ClaudeRunResult> {
  if (busyConversations.has(conversationId)) {
    throw new Error(m().runtime.requestInFlight);
  }
  busyConversations.add(conversationId);

  try {
    const systemNote = [WEB_ACCESS_SYSTEM_NOTE, loadRulesSystemNote()].filter(Boolean).join("\n\n");

    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
      // Politika her koşuda yeniden üretiliyor: kardeş proje listesi aktif
      // projeye göre değişiyor ve proje arada değişmiş olabilir.
      "--settings",
      buildPolicy(projectPath).settings,
      "--append-system-prompt",
      systemNote,
    ];

    const model = state.getModel(conversationId);
    if (model) args.push("--model", model);

    const sessionId = state.getSessionId(conversationId, projectName);
    if (sessionId) args.push("--resume", sessionId);

    const { stdout } = await execa("claude", args, {
      cwd: projectPath,
      timeout: CLAUDE_TIMEOUT_MS,
      // Ortam allowlist'ten kuruluyor: BOT_TOKEN ve diğer bot sırları geçmiyor.
      env: childEnv(),
      extendEnv: false,
    });

    const parsed = JSON.parse(stdout) as ClaudeJsonResult;

    if (parsed.session_id) {
      state.setSessionId(conversationId, projectName, parsed.session_id);
    }
    const primaryModel = pickPrimaryModel(parsed.modelUsage);
    if (primaryModel) {
      state.setLastModel(conversationId, primaryModel);
    }
    if (parsed.usage || parsed.total_cost_usd) {
      state.recordUsage(conversationId, projectName, {
        inputTokens: parsed.usage?.input_tokens ?? 0,
        outputTokens: parsed.usage?.output_tokens ?? 0,
        cacheCreationTokens: parsed.usage?.cache_creation_input_tokens ?? 0,
        cacheReadTokens: parsed.usage?.cache_read_input_tokens ?? 0,
        costUsd: parsed.total_cost_usd ?? 0,
      });
    }

    return {
      text: parsed.result ?? (parsed.is_error ? "Claude bir hata döndürdü ama mesaj içermiyor." : ""),
      isError: parsed.is_error,
    };
  } catch (error) {
    const sessionId = state.getSessionId(conversationId, projectName);

    // Hatayı HER durumda logla. Eskiden sessizce yutuluyordu ve "Claude neden
    // geçmişi unuttu?" sorusu geriye dönük olarak cevaplanamıyordu.
    console.error(
      `[claude] run failed (project=${projectName}, resumed=${Boolean(sessionId)}): ${(error as Error).message}`
    );

    // Bayat oturum: sil, bir kez sıfırdan dene — ama kullanıcıya söyle.
    if (sessionId && !afterHistoryReset && looksLikeStaleSession(error)) {
      state.clearSessionId(conversationId, projectName);
      busyConversations.delete(conversationId);
      const retried = await run(conversationId, projectPath, projectName, prompt, true);
      return { ...retried, historyReset: true };
    }

    throw error;
  } finally {
    busyConversations.delete(conversationId);
  }
}
