# Contributing to pocketdev

Thanks for taking a look. This file covers what you need to know before opening
a pull request — the scope, the three commands that gate every change, and the
one testing rule that is not obvious from reading the code.

## Scope

Two things are deliberately out. Please don't spend time on them:

- **Multi-user.** One owner, one machine, by design.
- **Tailscale on the phone.** Not required and not planned.

**Android is open.** It is not implemented today — the build and distribution
layer is iOS-only — but it is wanted, not refused. Two notes if you want to take
it on:

- The seams already exist. Project type is abstracted behind `ProjectAdapter`
  (`src/platform/adapter.ts`) and the iOS toolchain is isolated in
  `src/platform/ios/` (`ipaExporter`, `otaServer`, `tunnel`). Android would be a
  parallel `src/platform/android/` plus Android-aware adapter methods — not a
  rewrite, but a substantial piece of work.
- Parts of it are *easier* than iOS. There is no signing paywall: a debug APK
  installs on a real device without a paid developer account, which removes the
  biggest barrier the iOS path has.

Open an issue to agree on the shape before writing much code.

Everything else is fair game — especially the rough edges. The project is young
and used mainly against its author's own projects, so gaps are expected.

## Setup

Requirements are in the [README](README.md#requirements). Once you have them:

```bash
npm install
npm run web:install   # only if you touch the web panel
cp .env.example .env  # BOT_TOKEN is the only required value
```

## The three commands

CI runs these on every push and pull request. Run them locally first.

```bash
npm run typecheck   # tsc --noEmit, source and tests
npm test            # the full test suite (node:test)
npm run web:build   # only if you touched web/
```

The test job runs on **Node 20.x and 22.x**. If something works on your machine
but fails in CI, a version difference is the first thing to check — the test
script enumerates files with `find` rather than a glob precisely because
`node --test` had no glob support before Node 22.

## The testing rule

**Tests must not shell out.** They parse *recorded* output of `xcodebuild`,
`xcdevice`, `tailscale`, and friends, held as fixtures in the test files.

That is why the test suite for a macOS-only application runs on Linux CI, and
why it takes under two seconds. It is the single most important convention here.

If your change needs to understand a new tool interaction:

1. Run the real command once, by hand.
2. Paste its output into the test as a fixture.
3. Write the parser against that fixture.

Do not add a test that invokes `xcodebuild`. It will not run in CI.

## Language

| Where | Language |
|---|---|
| Test names | **English** |
| Code comments | English or Turkish — your choice |
| Identifiers, types, function names | English |
| README, this file, `docs/` | English (the README has a `.tr.md` mirror) |
| User-facing strings | Both, via `src/i18n/` |

Test names are English so that a failing CI log is readable by anyone. Keep new
ones in English.

Comments are a different matter: many existing ones are Turkish, and either
language is fine in new code. Use whichever one lets you explain the *why* most
clearly — that matters far more than consistency. Please don't translate
existing comments as part of an unrelated change; it buries the actual diff.

## Comments explain *why*, and cite the source

Comments here do not restate the code. They record the reason a decision was
made, and when that reason lives in someone else's source tree, they name the
file and line. For example, from `src/platform/expo/devServer.ts`:

```ts
// CI=1 KOYMA: Expo CLI watch modunu doğrudan buna bağlıyor
// (`isWatchEnabled()` → `return !env.CI`, instantiateMetro.ts), yani CI=1 ile
// Metro dosyaları hiç izlemez ve /preview'da fast refresh ölür.
```

If you worked something out the hard way, write it down like this. It is the
most valuable thing a pull request can leave behind.

## Common changes

**Adding a slash command.** Write the handler in `src/commands/handlers/`, add
one line to `src/commands/registry.ts`, and add the message keys to both i18n
files. Channels (Telegram, the web panel) read that registry, so you do not wire
the command per channel.

**Adding a project type.** Implement `ProjectAdapter` in
`src/platform/<kind>/adapter.ts` and register it in the `ADAPTERS` array in
`src/platform/adapter.ts`. Order matters — the first matching entry wins, which
is why Expo is checked before React Native CLI.

**Reading Expo configuration.** Use `readExpoConfig` from
`src/platform/expo/config.ts`. Never read `app.json` directly: a project may use
`app.config.ts`, `app.config.js`, or `app.config.json` instead, and a dynamic
config can override the static one.

## Translations

Every user-facing string lives in `src/i18n/en.ts` and `src/i18n/tr.ts`. The
type system enforces parity — `tr` is declared as `Messages`, so a missing or
extra key is a compile error, not a runtime surprise.
`test/i18n/locales.test.ts` catches what the type cannot: blank translations and
functions that forget to use their placeholder.

## Security-sensitive areas

Changes to `src/claude/sandbox.ts`, `RULES.md`, or the permission deny list need
an explicit justification in the pull request. In particular, do not weaken
`failIfUnavailable`, `allowUnsandboxedCommands: false`, or
`network.strictAllowlist` without saying why — they exist because there is no
human present to approve a prompt. See [`docs/SANDBOX.md`](docs/SANDBOX.md).

## Never commit

`.env`, `.p8` signing keys, `dist/`, `workspace/`, `data/`, `scratch/`.

All are gitignored, but check `git status` before you commit anyway — the
workspace holds real projects and `data/` holds session state.

## Style

There is no linter and no formatter. Match the surrounding code: two-space
indent, double quotes, semicolons, named exports for logic and default exports
for handlers.

## Pull requests

Keep them small and focused. In the description, say **what you verified and on
what** — macOS version, Xcode version, Node version, and the device if an iOS
path was involved.

If you could not test the iOS build path, say so. Most contributors cannot: it
needs a paid Apple Developer account and a physical device. A well-reasoned
change with an honest "untested on device" note is welcome.

## Reporting bugs

Include:

- the output of `/doctor`
- whether the project is Expo or React Native CLI
- for Expo, whether it uses `app.json`, `app.config.json`, or `app.config.js|ts`
- macOS, Xcode, and Node versions

The last two points matter more than they look — most platform bugs found so far
came from a project shape the author does not personally use.

## License

By contributing you agree that your work is licensed under the [MIT
License](LICENSE).
