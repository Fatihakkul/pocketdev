/**
 * Kaynak dil. **Sözlüğün şeklini bu dosya tanımlıyor** — `Messages` tipi
 * buradan türetildiği için başka bir dilde eksik ya da fazla anahtar derleme
 * hatası veriyor. Yani çeviri sessizce geride kalamıyor.
 *
 * Yer tutucu ayrıştıran bir `t("key", {...})` yerine düz fonksiyonlar
 * kullanılıyor: argüman sayısı ve tipi de aynı kontrole giriyor, çalışma
 * zamanında ayrıştırma yok, ve yeni bağımlılık gerekmiyor.
 *
 * Yalnızca KULLANICIYA görünen metinler buraya taşınıyor. Kod yorumları ve log
 * satırları Türkçe kalıyor — onlar projenin birikmiş hafızası ve çevirmek o
 * değeri yakardı.
 */
export const en = {
  auth: {
    claimed:
      "✅ Ownership confirmed. This bot now answers only you.\n\nSend /help to get started.",
    wrongCode: "Wrong code. Use the code printed in the console of the machine running the bot.",
    unclaimedConsole: (code: string): string =>
      "\n" +
      "  This bot has no owner yet.\n" +
      `  Send this to your bot on Telegram:  /claim ${code}\n` +
      "  (the code changes on every restart)\n",
  },

  help: {
    heading: "Commands:",
    footer:
      "\nPlain text goes to Claude Code: in the active project's folder if one is selected, " +
      "otherwise in a general scratch area (so planning chats need no project). " +
      "Note that nothing reaches Claude until you unlock the session with /newchat.\n\n" +
      "There is no command for saving or loading plans — just ask in plain text " +
      '("save this as a plan", "list my plans", "load that plan"). ' +
      "Claude manages them under workspace/plans/ on its own.",
  },

  doctor: {
    checking: "⏳ Checking your setup…",
    failed: (reason: string): string => `Could not finish the check:\n${reason}`,
    scope: "Setup check",
    scopeWithProject: (project: string): string => `Setup check (project: ${project})`,
    allGood: "Everything is ready.",
    countMissing: (n: number): string => `${n} missing`,
    countWarnings: (n: number): string => `${n} warning${n === 1 ? "" : "s"}`,

    xcode: "Xcode",
    xcodeFix: "Install Xcode from the App Store, then: sudo xcode-select --switch /Applications/Xcode.app",
    claudeCode: "Claude Code",
    claudeCodeFix: "https://claude.com/claude-code — sign in with `claude` after installing.",
    cocoapods: "CocoaPods",
    cocoapodsFix: "Needed for React Native CLI projects (not for Expo): brew install cocoapods",
    installed: "installed",
    notFound: "not found",

    certificate: "Distribution certificate",
    certificateMissing: "not in your keychain",
    certificateFix:
      "Needed for /otabuild (not for /localbuild or /preview).\n" +
      "Apple Developer portal → Certificates → Apple Distribution, download and double-click it.",

    tunnel: "Tunnel (Tailscale Funnel)",
    tunnelReady: "ready",
    tunnelUnavailable: "unavailable",

    project: "Project",
    projectUnreadable: "could not be read",
    profile: "Ad-hoc profile",
    profileMissing: "missing — only /otabuild is affected",
  },

  tunnel: {
    notLoggedIn: (state: string): string =>
      `Tailscale is not logged in (state: ${state}).\n  tailscale up`,
    noMachineName: "Could not read the Tailscale machine name (MagicDNS may be off).",
    httpsDisabled:
      "HTTPS certificates are off for this tailnet; Funnel cannot establish TLS without them.\n" +
      "  Admin console → DNS → HTTPS Certificates → Enable",
    funnelNotAllowed:
      "This machine is not allowed to use Funnel.\n" +
      "  Admin console → Access Controls → add the `funnel` attribute under nodeAttrs",
    daemonUnreachable:
      "Could not reach the Tailscale service. Setup:\n" +
      "  sudo brew services start tailscale\n" +
      "  tailscale up",
    statusUnreadable: "Could not parse the output of `tailscale status`.",
    cloudflaredMissing: "cloudflared not found (OTA_TUNNEL=cloudflared).\n  brew install cloudflared",
    unreachable: (target: string, detail: string): string =>
      `The address came up but was not reachable: ${target} (${detail})`,
    noConnection: "could not connect",
    lastStatus: (status: number): string => `last response: HTTP ${status}`,
    enableVia: (reason: string, link: string): string =>
      `${reason}\n\nVisit this link to enable it:\n${link}`,
    certPending: (health: string, logHint: string): string =>
      `${health}\n\n` +
      "The TLS certificate is still being issued; HTTPS will not connect until it completes. " +
      "The first certificate can take minutes. If validation keeps failing, Let's Encrypt " +
      "applies an hourly quota (5 failed validations per identifier) and you have to wait.\n" +
      `Details: ${logHint}`,
    genericFailure: (message: string, logPath: string, logHint: string): string =>
      `${message}\n\n` +
      "If Funnel did not come up, the tailnet settings are probably incomplete:\n" +
      "• HTTPS certificates must be enabled in the admin console\n" +
      "• Funnel must be allowed for this machine in the ACL\n" +
      `• Log: ${logPath}\n` +
      `• tailscaled log: ${logHint}`,
    logHintFallback: "tailscaled log (var/log/tailscaled.log on Homebrew installs)",
  },

  /** `/help` ve panelde görünen komut açıklamaları (`commands/registry.ts`). */
  commands: {
    help: "List commands",
    new: "Create a project",
    newUsage: "<name> [template]",
    templates: "List available templates",
    projects: "List projects",
    use: "Switch the active project",
    useUsage: "<name>",
    newchat: "Reset the project selection and Claude session, unlock",
    endchat: "End the Claude session and lock",
    preview: "Start the dev server + tunnel",
    stop: "Stop the running preview",
    record: "Record a short video on the iOS simulator",
    qabuild: "QA build on EAS (Release)",
    devbuild: "Development build on EAS (Debug)",
    localbuild: "Build Debug locally and install it on a connected device (no EAS credits)",
    localbuildUsage: "[device]",
    otabuild: "Build an .ipa locally and get an install link (wireless, no credits)",
    otabuildUsage: "[dev]",
    otalink: "Resend the current OTA install link",
    otastop: "Close the OTA link",
    pwd: "Show the active project folder",
    ls: "List files",
    lsUsage: "[path]",
    mkdir: "Create a folder",
    mkdirUsage: "<name>",
    diff: "Show git diff",
    diffUsage: "[path]",
    model: "Show/change the model",
    modelUsage: "[name]",
    usage: "Show token and cost usage",
    doctor: "Check the setup (Xcode, certificate, tunnel, profile)",
  },

  project: {
    noneActive: "No active project. Pick one with /new or /use first.",
    newUsage: "Usage: /new <name> [template]",
    invalidName: "A project name may only contain letters, digits, - and _.",
    alreadyExists: (name: string): string => `"${name}" already exists. Activate it with /use ${name}.`,
    templateNotFound: (template: string): string =>
      `Template "${template}" not found. Check /templates for the list.`,
    templateAmbiguous: "There is more than one template — say which one you want: /templates",
    creating: (name: string, template: string): string => `⏳ Creating "${name}" (${template})…`,
    createFailed: (reason: string): string => `Could not create the project: ${reason}`,
    useUsage: "Usage: /use <name>",
    notFound: (name: string): string => `"${name}" not found. Check /projects for what exists.`,
    switched: (name: string): string => `✅ Active project: ${name}`,
    none: "No projects yet. Create one with /new <name>.",
    activeSuffix: "active",
  },

  fs: {
    empty: "(empty)",
    outsideProject: "That path is not reachable.",
    error: (reason: string): string => `Error: ${reason}`,
    mkdirUsage: "Usage: /mkdir <name>",
    created: (relativePath: string): string => `✅ Created: ${relativePath}`,
    noChanges: "No changes.",
    diffFailed: (reason: string): string => `Could not run git diff (is this a git repository?): ${reason}`,
  },

  chat: {
    locked: "🔒 Send /newchat first, then we can talk.",
    sandboxVerifying: "⏳ The sandbox check is still running, try again in a few seconds.",
    sandboxFailed: (detail: string): string =>
      `🚫 The sandbox could not be verified, so no Claude session will start.\n${detail}`,
    busy: "The previous request is still running, please wait.",
    working: "⏳ Claude is working…",
    started:
      "✅ New chat started (no project selected). Plan freely; when you are ready, /new turns it into a project.\n\n" +
      "🔓 Unlocked — you can talk until you call /endchat.",
    ended:
      "✅ Claude session ended (the project selection did not change).\n\n" +
      "🔒 Locked — send /newchat to talk again.",
  },

  ota: {
    alreadyBuilding: "An OTA build is already running, please wait.",
    usage: "Usage: /otabuild (Release, runs offline) or /otabuild dev (Debug, with fast refresh).",
    started: (configuration: string): string =>
      `⏳ OTA build started (${configuration} archive → .ipa → tunnel).\n` +
      "The first archive takes 10-20 min. No EAS credits are used.",
    progress: (stage: string, elapsed: string): string => `⏳ ${stage} (${elapsed})`,
    ready: (elapsed: string, url: string): string => `✅ Install ready (${elapsed}):\n${url}`,
    resynced:
      "🔧 Dependencies had changed, so the native project was re-synced — until you install this " +
      "build, the old app keeps failing on the missing native module.\n",
    openInSafari:
      "📱 Open the link **in Safari** and tap \"Install\". Telegram's own browser cannot open " +
      "install links — use \"Open in Safari\" if needed.",
    debugNote:
      "⚠️ This is a Debug build — it will not open on its own. After installing, start the dev " +
      "server with /preview; the link it returns opens the app and fast refresh works.",
    releaseNote: "✔️ This build runs offline, /preview is not needed (no dev mode, no fast refresh).",
    overwriteWarning: "⚠️ It uses the same bundle id, so it replaces the other build on your phone.",
    expiryWarning: (minutes: number): string =>
      `⚠️ The link closes after ${minutes} minutes or with /otastop; it also stops working if the Mac sleeps.`,
    failed: (reason: string): string => `OTA build failed:\n${reason}`,
    stopped: "OTA link closed.",
    noLink: "There is no open OTA link.",
    linkIs: (url: string): string => `Install link:\n${url}`,
    noLinkHint: "There is no open OTA link. Get a new one with /otabuild.",
  },

  preview: {
    alreadyRunning: "A preview is already running. Stop it with /stop first.",
    starting: "⏳ Starting the dev server + tunnel (the first run can take a few minutes)…",
    doNotTapMulti:
      "📱 **Do NOT tap the addresses below** — copy them. Tapping opens the web version in a browser (no dev mode).",
    doNotTapSingle:
      "📱 **Do NOT tap the address below** — copy it. Tapping opens the web version in a browser (no dev mode).",
    waySafari: "**Way 1 — Safari (fastest):**",
    waySafariHint: "Copy this link, paste it into Safari's address bar and hit Go:",
    wayInApp: "**Way 2 — from inside the app:**",
    wayInAppHint: (clientName: string): string =>
      `Open ${clientName}, shake the device (or three-finger tap) → dev menu → "Enter URL manually" → paste this address:`,
    stopHint: "Send /stop when you are done.",
    qrCaption: "Use this QR if you want to scan it from another device.",
    failed: (reason: string): string => `Could not start the preview:\n${reason}`,
    stopped: "🛑 Preview stopped.",
    notRunning: "No preview is running.",
  },

  build: {
    localAlreadyRunning: "A local build is already running, please wait.",
    localStarted: (device: string, osVersion: string): string =>
      `⏳ Local Debug build started → ${device} (${osVersion}).\n` +
      "The first build takes 10-20 min; later ones are incremental and much faster. No EAS credits are used.",
    localProgress: (device: string, elapsed: string): string =>
      `⏳ Local Debug build running → ${device} (${elapsed})`,
    localInstalled: (device: string): string => `installed on ${device}`,
    localReady: (device: string, elapsed: string): string =>
      `✅ Local build ready and installed on ${device} (${elapsed}).\n\n` +
      "⚠️ This is a Debug build — it will not open on its own. Start the dev server with /preview before using it.\n" +
      "⚠️ It uses the same bundle id, so it replaces the QA build on your phone.",
    localFailed: (reason: string): string => `Local build failed:\n${reason}`,

    qaAlreadyRunning: "A QA build is already running, please wait.",
    qaStarted:
      "⏳ iOS build started on EAS (for QA testing). This usually takes 10-20 minutes; I will tell you when it is done…",
    qaReady: (pageUrl: string, downloadUrl: string): string =>
      `✅ Build ready! Open this link on a registered device to install it:\n${pageUrl}` +
      (downloadUrl ? `\n\nDirect .ipa: ${downloadUrl}` : ""),
    qaFailed: (reason: string): string => `QA build failed:\n${reason}`,

    devAlreadyRunning: "A build is already running, please wait.",
    devStarted:
      "⏳ Development build started on EAS (Debug, with fast refresh). It takes 10-20 minutes; I will tell you when it is done…",
    devReady: (pageUrl: string, downloadUrl: string): string =>
      `✅ Development build ready! Open this link on a registered device to install it:\n${pageUrl}` +
      (downloadUrl ? `\n\nDirect .ipa: ${downloadUrl}` : "") +
      "\n\n⚠️ This build does not work on its own — start the dev server with /preview before opening it." +
      "\n⚠️ It uses the same bundle id, so it replaces the QA build on your phone.",
    devFailed: (reason: string): string => `Development build failed:\n${reason}`,

    minutes: (n: number): string => `${n} min`,
  },

  record: {
    alreadyRunning: "A recording is already running, please wait.",
    caption: (project: string): string => `🎥 "${project}" — current state (iOS Simulator)`,
    failed: (reason: string): string => `Could not record the video:\n${reason}`,
  },

  model: {
    forced: (name: string): string => `Model pinned to: ${name}`,
    notForcedWithLast: (last: string): string =>
      `No model is pinned (the account default is used). The last message used: ${last}`,
    notForced:
      "No model is pinned (the account default is used). No message has been sent yet, so the real model is unknown.",
    set: (name: string): string => `✅ Model set: ${name}`,
  },

  usage: {
    none: "No usage recorded yet. Send Claude a message and try /usage again.",
    inputTokens: "Input tokens",
    outputTokens: "Output tokens",
    cacheWrite: "Cache write",
    cacheRead: "Cache read",
    totalCost: "Total cost",
    total: "Total usage:",
    forProject: (project: string): string => `"${project}" project:`,
  },

  /** Runner ve platform katmanı — komut handler'larından değil, alt katmandan gelenler. */
  runtime: {
    requestInFlight: "A request is already running, please wait.",
    folderPickerTimedOut: "The folder picker dialog timed out.",
    noBundleIdentifier:
      "expo.ios.bundleIdentifier is not set in app.json, so no signing profile can be chosen.",
    noBundleIdentifierForLink:
      "expo.ios.bundleIdentifier not found in app.json, so the development build link could not be built.",
    noBundleIdentifierBeforeBuild:
      "expo.ios.bundleIdentifier is not set in app.json — that has to be set first.",
    metroExited: "Metro exited unexpectedly.",
    previewAlreadyRunning: "A preview is already running. Stop it with /stop first.",
    tunnelUrlTimeout: "Could not get the tunnel URL (timed out).",
    expoCliMissing: "expo CLI not found. Make sure the dependencies are installed (npm install).",
    noSimulator: "No usable iOS simulator was found.",
    buildSettingsUnreadable: "Could not read the xcodebuild settings (the expected JSON did not arrive).",
    noXcodeProject: "Neither .xcworkspace nor .xcodeproj was found under ios/.",
    buildTimedOut: "The build timed out.",
    buildNotStarted: "Could not start the build (empty response).",
    noMatchingDevice: (search: string, list: string): string =>
      `No device matches "${search}". Connected devices:\n${list}`,
  },

  signing: {
    noIosFolder: "There is no ios/ folder — the native project has not been generated yet.",
    noWorkspace: "No .xcworkspace under ios/. Are the Pods installed? (`pod install`)",
    noIpaProduced: (contents: string): string =>
      `Export finished but produced no .ipa. Folder contents: ${contents || "(empty)"}`,
    noManifest:
      "manifest.plist was not produced — the `manifest` key in ExportOptions.plist may not have been processed.",
    noCertificate: (teamId: string): string =>
      `No distribution certificate for team ${teamId} in your keychain.\n` +
      "Create one in the Apple Developer portal (Certificates → Apple Distribution) and double-click the download.",
    noProfileDirectory: "The provisioning profile folder does not exist. Is an ad-hoc profile installed?",
    allProfilesExpired: (bundleId: string, names: string): string =>
      `Every installed ad-hoc profile for ${bundleId} has expired (${names}).\n` +
      "Renew it in the Apple Developer portal, or let it be regenerated if ASC_KEY_ID is configured.",
    noProfile: (bundleId: string): string =>
      `No ad-hoc DISTRIBUTION profile installed for ${bundleId}.\n\n` +
      "Xcode's own development profile is not enough: installing over the air requires a " +
      "distribution profile with `get-task-allow=false`.\n\n" +
      "Where to get one:\n" +
      "• Apple Developer portal → Profiles → + → Distribution → Ad Hoc\n" +
      "• Or set ASC_KEY_ID / ASC_ISSUER_ID and it will be created for you (see README)\n\n" +
      "The downloaded file goes under ~/Library/Developer/Xcode/UserData/Provisioning Profiles/",
    ascKeyMissing: (keyPath: string): string =>
      `App Store Connect key not found: ${keyPath}\n` +
      "Set ASC_KEY_PATH to its location, or move the file there.",
    multipleTeams: (teamIds: string): string =>
      `Your keychain has distribution certificates for more than one team (${teamIds}). ` +
      "It is ambiguous which to use; remove the one you do not need.",
  },
};

/**
 * Sözlüğün şekli. Diğer diller bunu birebir karşılamak zorunda.
 *
 * `as const` BİLEREK kullanılmıyor: metinleri değişmez sabitlere kilitler ve
 * çeviriden İngilizcesiyle birebir aynı dizgeyi isterdi. Genişletilmiş haliyle
 * kontrol edilen şey doğru olan: anahtar kümesi ve fonksiyon imzaları.
 */
export type Messages = typeof en;
