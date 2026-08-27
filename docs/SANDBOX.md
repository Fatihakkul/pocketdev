# Sandboxing channel sessions

*[Türkçe](SANDBOX.tr.md)*

This limits what a Claude session opened through a channel (Telegram or the web
panel) can reach. **It does not affect your own interactive Claude Code
session** — the policy is handed only to the process `claudeRunner` spawns with
`--settings`; `~/.claude/settings.json` and the project's own
`.claude/settings.json` are left untouched. For the same reason, any hooks added
later must go into that same inline JSON.

## Why it was needed

Measured on 2026-08-11: a session opened through the bot could in practice reach
everything the `you` user could — `~/.ssh`, the Keychain, nine other projects,
unrestricted network egress, and the bot's own `BOT_TOKEN` in its environment.
The restrictions in place at the time were not a real boundary but **a
prefix-string filter**: `Bash(curl*)` was listed, yet `node -e "fetch(...)"` ran
freely.

The real risk is not an unauthorised user — the Telegram side is locked to a
single `ALLOWED_USER_ID`. It is **prompt injection** arriving through a file read
from a repo, something inside `node_modules`, or a page fetched with WebFetch,
meeting an agent running with full privileges. The system prompt and `RULES.md`
are only a soft layer against that.

## Two layers, both required

| Layer | Where it applies | What it binds |
| --- | --- | --- |
| `sandbox.*` | seatbelt (`sandbox-exec`) on macOS, `bwrap` on Linux | commands run through Bash — kernel level |
| `permissions.deny` | inside the CLI process | the `Read` / `Edit` / `Write` tools |

Writing only the sandbox is not enough: `cat` gets blocked, but Claude reaches
for the `Read` tool instead. That is exactly what the measurement showed —
`cat ~/.ssh/id_ed25519` was blocked, and `Read` opened the same file.

## Measured behaviour (`src/claude/sandbox.ts`)

A controlled comparison — the same commands with the sandbox on and off:

| Check | Sandbox on | Sandbox off |
| --- | --- | --- |
| `~/.ssh/id_ed25519` via `Read` | BLOCKED | (no rule) |
| `cat ~/.ssh/id_ed25519` | BLOCKED | SUCCEEDED |
| A file in a sibling project via `Read` | BLOCKED | — |
| The bot's own `.env` via `Read` | BLOCKED | — |
| Writing inside the active project | WORKS | WORKS |
| `curl registry.npmjs.org` (allowlisted) | HTTP 200 | HTTP 200 |
| `curl example.com` (not listed) | 000 (blocked) | HTTP 200 |

## Three traps (all found by measurement)

### 1. A single slash in a permission rule means the workspace root

The rule `Read(/Users/you/.ssh/**)` is interpreted as
`<project>/Users/you/.ssh` and therefore **never matches**. Reaching the
filesystem root requires a double slash: `Read(//Users/you/.ssh/**)`.

The insidious part is that a mistyped rule raises no error — it silently fails
to match. In the first implementation `~/.ssh` stayed readable for exactly this
reason, and because `permission_denials` came back empty it looked like it was
working. On the `sandbox.filesystem.*` side a single-slash absolute path is
correct — the two layers do not share a syntax.

### 2. The network restriction is enforced through a proxy

Seatbelt has `deny default`; traffic to allowed domains goes through **a local
HTTP/SOCKS proxy** (a CA certificate is injected, and `NO_PROXY` keeps localhost
and the private IP ranges out). The consequences:

- `curl`, `git` and `npm` honour the proxy, so the allowlist works — `npm
  install` does not break inside Claude sessions.
- Node's global `fetch` ignores `HTTP_PROXY`, so it cannot get through even to
  an allowlisted domain. This is why our first network test read as misleading.
  On the **security side it is a win**: an exfiltration attempt arriving through
  injection as `node -e "fetch(...)"` dies regardless of the domain.

### 3. A misspelled key is ignored silently

`failIfUnavailable: true` only catches the case where the sandbox *cannot be
established*. If a key name is wrong the policy is never loaded at all and we
believe we are protected — which is precisely how the first trap was found.

Because of that the bot runs a **canary test** at startup
(`src/claude/sandboxSelfTest.ts`): it tries to read a file the policy is
supposed to deny (`data/state.json`) and refuses to accept free-form messages
until it has seen that read blocked. Until verification passes, `handleMessage`
rejects incoming messages. It can be turned off with `SANDBOX_SELFTEST=0` — it
costs a small model run at every startup — but the default is on.

## What the policy covers

**Closed to reads:** `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.docker`,
`~/.config/gh`, `~/.npmrc`, `~/Library/Keychains`, `~/.claude`, the bot's `.env`
and `data/` folder, **and every sibling of the active project**.

Siblings are enumerated at runtime and denied one by one. A denylist has no way
to say "except this directory", so instead of writing an exception the siblings
had to be counted; this works both for projects inside the workspace and for
linked projects outside it.

**Environment variables are an allowlist** (`claudeRunner.childEnv`): `PATH`,
`HOME`, `USER`, `SHELL`, `TMPDIR`, the locale and `TERM` variables, and the
`ANTHROPIC_*` / `CLAUDE_*` prefixes get through. `BOT_TOKEN`, `ALLOWED_USER_ID`
and every secret added later stay out automatically — with a denylist, each new
secret would leak. `SSH_AUTH_SOCK` is deliberately absent too: if it passed
through, the agent could sign with the keys even without being able to read
`~/.ssh`.

## Known gaps

- **Command intent is still limited to string matching.** Rules like
  `Bash(git commit*)` remain, and `git -C /path commit` walks past them. The
  real fix is a `PreToolUse` hook that sees the normalised command and applies
  an allowlist. Not done.
- **The bot repository's own source is readable** (only `.env` and `data/` are
  closed). The bot sits above the workspace, so it is not part of the sibling
  enumeration.
- **The sibling list is frozen at run time.** A new sibling directory created
  during a long session is not denied within that session; it enters the list on
  the next run.
- **Writing outside the active project may be possible** — beyond the explicitly
  denied paths, this relies on the sandbox's default write posture and has not
  been measured.
