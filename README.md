# pocketdev

[![CI](https://github.com/Fatihakkul/pocketdev/actions/workflows/ci.yml/badge.svg)](https://github.com/Fatihakkul/pocketdev/actions/workflows/ci.yml)

*[Türkçe README](README.tr.md)*

**Develop from your phone.** Claude Code writes code on your Mac; you watch the
result live on your phone and drive the whole loop from Telegram — including
building the app and installing it on your device.

The interesting half is the second one. Remote chat with an AI is a solved
problem. Getting a **real, signed build of your app onto your physical iPhone**,
over the internet, with live reload, without paying for EAS Build, TestFlight,
ngrok or a VPS — that is what this project actually does.

| Job | Usually costs | Here |
|---|---|---|
| iOS build | EAS Build credits | local `xcodebuild` (`/localbuild`, `/otabuild`) |
| Install on a test device | TestFlight / EAS Submit | local `.ipa` over Tailscale Funnel (`/otabuild`) |
| Tunnel / hosting | ngrok Pro, a VPS | Tailscale Funnel, free (cloudflared as fallback) |
| Driving the work | — | Claude Code over Telegram and a local web panel |

Works with **Expo** and **React Native CLI** projects.

> **Status:** used daily by its author, verified end to end on real devices, but
> young. Expect rough edges. macOS + iOS only — see [Scope](#scope).

---

## Requirements

- **macOS** with **Xcode** and the command line tools
- **Node.js 20+**
- **[Claude Code](https://claude.com/claude-code)**, installed and signed in
- **[Tailscale](https://tailscale.com/)** — free tier is enough
- **CocoaPods** — only for React Native CLI projects
- A **paid Apple Developer account** ($99/yr) — only for `/otabuild`.
  `/localbuild`, `/preview` and `/record` work without one.

## Setup

```bash
git clone https://github.com/Fatihakkul/pocketdev.git
cd pocketdev
npm install
cp .env.example .env
```

**1. Create a Telegram bot.** Message [@BotFather](https://t.me/BotFather),
send `/newbot`, and put the token it gives you into `.env`:

```
BOT_TOKEN=123456:ABC-DEF...
```

**2. Start it.**

```bash
npm run dev
```

The console prints a one-time claim code:

```
This bot has no owner yet.
Send this to your bot on Telegram:  /claim 481902
```

**3. Claim it.** Send `/claim <code>` to your bot from Telegram. That user is
now the owner and the bot ignores everyone else. You do not need to look up
your numeric Telegram ID.

The bot speaks English by default. For Turkish, put `LOCALE=tr` in `.env`.

**4. Set up Tailscale**, which serves previews and install links over HTTPS:

```bash
tailscale up
```

Then, in the [Tailscale admin console](https://login.tailscale.com/admin):
- **DNS → HTTPS Certificates → Enable**
- **Access Controls** — allow `funnel` for this machine via `nodeAttrs`

**5. Check your setup.** Send `/doctor` to the bot. It verifies Xcode, Claude
Code, CocoaPods, your signing certificate, the tunnel, and — if a project is
selected — the app identity and provisioning profile, and tells you how to fix
whatever is missing.

## Everyday use

```
/new my-app          create a project
/use my-app          switch to it
<just type>          talk to Claude Code in that project
/diff                see what changed
/preview             start the dev server and connect your phone to it
/localbuild          build Debug and install it on the cable-connected device
/otabuild            build a signed .ipa and get an install link for your phone
/doctor              check the setup
```

`/otabuild` gives you an HTTPS link. Open it **in Safari** on your phone and tap
Install. Telegram's in-app browser cannot open `itms-services://` links, so use
"Open in Safari" if needed. The link expires after 60 minutes or on `/otastop`.

`/otabuild` builds Release (runs offline, no dev server needed).
`/otabuild dev` builds Debug, which pairs with `/preview` for live reload.

There is also a local web panel at `http://127.0.0.1:4300` with job status,
live logs and an `.env` editor.

<details>
<summary>All commands</summary>

| Command | Does |
|---|---|
| `/help` | list commands |
| `/new <name> [template]` | create a project |
| `/templates` | list templates |
| `/projects` | list projects |
| `/use <name>` | switch active project |
| `/newchat` | reset project selection and Claude session |
| `/endchat` | end the Claude session |
| `/preview` | start the dev server + tunnel |
| `/stop` | stop the running preview |
| `/record` | record a short video on the iOS simulator |
| `/localbuild [device]` | Debug build installed on a connected device |
| `/otabuild [dev]` | signed `.ipa` + install link |
| `/otalink` | resend the current install link |
| `/otastop` | close the install link |
| `/qabuild` | Release build on EAS *(Expo only, uses EAS credits)* |
| `/devbuild` | development build on EAS *(Expo only, uses EAS credits)* |
| `/pwd`, `/ls`, `/mkdir`, `/diff` | file and git basics |
| `/model` | show/change the Claude model |
| `/usage` | token and cost usage |
| `/doctor` | check the setup |

</details>

## Code signing for `/otabuild`

This is the hard part, and it is Apple's doing rather than this project's.
Installing an app on a physical device over the air needs two things:

1. **A distribution certificate** — one per team, created once, reused by every
   app. If you have ever shipped an iOS app you already have it.
2. **An ad-hoc provisioning profile** — **per bundle id**, and it also has to be
   regenerated whenever you add a device or it expires yearly.

You can create both by hand in the Apple Developer portal (Certificates → Apple
Distribution; Profiles → **Ad Hoc**, selecting your device). `/doctor` tells you
which one is missing.

### Or let it generate the profile for you

Give the bridge an **App Store Connect API key** and `xcodebuild` creates the
missing profile itself, registering the device if needed:

1. App Store Connect → **Users and Access → Integrations → App Store Connect
   API → Team Keys → +**
2. **The role must be `Admin`.** `App Manager` is not enough and the failure is
   deeply misleading: you get `No profiles for '<bundleId>' were found`, which
   sends you hunting for a profile problem when it is really a permissions
   problem. A key's role cannot be changed after it is created — revoke it and
   generate a new one.
3. Download the `.p8` (**you only get one chance**), then:

```bash
mkdir -p ~/.appstoreconnect/private_keys
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/
chmod 600 ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
```

```
ASC_KEY_ID=XXXXXXXXXX
ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

This is a **one-time bootstrap, not a mode**: it only runs when no ad-hoc
profile exists. Xcode installs the profile it creates, so later builds go back
to the normal, faster path. Your existing distribution certificate is reused —
no new certificate is issued.

## Remote `/preview` on React Native CLI

`/preview` serves Metro over your tailnet, so your phone can connect over
cellular. React Native talks to the dev server over plain HTTP by default,
which a public HTTPS tunnel will not serve, so the app needs to be told to use
HTTPS. Expo projects don't need this — `expo-dev-client` handles it.

There is a related React Native bug documented in
[`docs/UPSTREAM_BUGS.md`](docs/UPSTREAM_BUGS.md): as of 0.83.1 the 8-argument
`jsBundleURLForBundleRoot:packagerHost:packagerScheme:…` discards the scheme it
is given, so setting `packagerScheme = "https"` alone does nothing. The
workaround is in that file.

If your phone is on the same Wi-Fi as the Mac, none of this matters.

## Scope

Deliberately **not** supported:

- **Android.** The whole build and distribution layer is iOS-specific.
- **Multi-user.** One owner, one machine, by design. Run your own.
- **Tailscale on the phone.** Not required and not planned.

## Security

- The bot answers exactly one Telegram user — the one who claimed it.
- Claude Code runs sandboxed; see [`docs/SANDBOX.md`](docs/SANDBOX.md).
- The web panel binds to `127.0.0.1` and has **no authentication** — do not
  expose it.
- `.env` and your `.p8` key are secrets. `.env` is gitignored; keep the key
  outside the repo.

## License

[MIT](LICENSE)
