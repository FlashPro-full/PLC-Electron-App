import type { IGlobalKeyDownMap, IGlobalKeyEvent } from "node-global-key-listener";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const MAX_BARCODE_LEN = 512;

const requireFromHere = createRequire(__filename);

let keyboardInstance: { kill: () => void } | null = null;
let listenerReady = false;

const NUMPAD_CHARS: Record<string, string> = {
  "NUMPAD 0": "0",
  "NUMPAD 1": "1",
  "NUMPAD 2": "2",
  "NUMPAD 3": "3",
  "NUMPAD 4": "4",
  "NUMPAD 5": "5",
  "NUMPAD 6": "6",
  "NUMPAD 7": "7",
  "NUMPAD 8": "8",
  "NUMPAD 9": "9",
  "NUMPAD DOT": ".",
  "NUMPAD DIVIDE": "/",
  "NUMPAD MULTIPLY": "*",
  "NUMPAD MINUS": "-",
  "NUMPAD PLUS": "+",
  "NUMPAD EQUALS": "=",
};

const NAMED_CHARS: Record<string, string> = {
  SPACE: " ",
  MINUS: "-",
  EQUALS: "=",
  "SQUARE BRACKET OPEN": "[",
  "SQUARE BRACKET CLOSE": "]",
  SEMICOLON: ";",
  QUOTE: "'",
  BACKSLASH: "\\",
  COMMA: ",",
  DOT: ".",
  "FORWARD SLASH": "/",
  BACKTICK: "`",
  TAB: "\t",
};

function appRootDir(): string {
  const env = process.env.PLC_APP_ROOT;
  if (!env) {
    return process.cwd();
  }
  return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
}

function resolveWinKeyServerExeFromRequire(): string | null {
  try {
    const pkgJson = requireFromHere.resolve("node-global-key-listener/package.json");
    return path.join(path.dirname(pkgJson), "bin", "WinKeyServer.exe");
  } catch {
    return null;
  }
}

function winKeyServerExeCandidates(): string[] {
  const seen = new Set<string>();
  const add = (p: string | null | undefined) => {
    if (p) {
      seen.add(path.resolve(p));
    }
  };
  add(resolveWinKeyServerExeFromRequire());
  add(path.join(appRootDir(), "node_modules", "node-global-key-listener", "bin", "WinKeyServer.exe"));
  add(path.join(process.cwd(), "node_modules", "node-global-key-listener", "bin", "WinKeyServer.exe"));
  return [...seen];
}

function findExistingWinKeyServerExe(): string | null {
  for (const p of winKeyServerExeCandidates()) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

type RestoreWinKeyServer = (pkgRoot: string) => Promise<boolean>;

function loadRestoreWinKeyModule(): { restoreWinKeyServer: RestoreWinKeyServer } | null {
  const root = appRootDir();
  const cjsAbs = path.join(root, "scripts", "ngkl-extract-win.cjs");
  if (!fs.existsSync(cjsAbs)) {
    return null;
  }
  const pkgJson = path.join(root, "package.json");
  try {
    if (fs.existsSync(pkgJson)) {
      return createRequire(pkgJson)("./scripts/ngkl-extract-win.cjs") as {
        restoreWinKeyServer: RestoreWinKeyServer;
      };
    }
  } catch {
    /* continue */
  }
  try {
    return createRequire(cjsAbs)("./ngkl-extract-win.cjs") as { restoreWinKeyServer: RestoreWinKeyServer };
  } catch {
    return null;
  }
}

async function resolveOrRestoreWinKeyServerExe(): Promise<string | null> {
  const existing = findExistingWinKeyServerExe();
  if (existing) {
    return existing;
  }
  const pkgRoot = path.join(appRootDir(), "node_modules", "node-global-key-listener");
  if (!fs.existsSync(pkgRoot)) {
    console.error("[keyboard] node-global-key-listener is not installed. Run: npm install");
    return null;
  }
  const mod = loadRestoreWinKeyModule();
  if (!mod) {
    console.error(
      "[keyboard] WinKeyServer.exe missing and scripts/ngkl-extract-win.cjs not found. Run: node scripts/ensure-win-keyserver.mjs"
    );
    return null;
  }
  try {
    console.info("[keyboard] downloading WinKeyServer.exe from npm registry…");
    const ok = await mod.restoreWinKeyServer(pkgRoot);
    if (!ok) {
      return null;
    }
  } catch (e) {
    console.error("[keyboard] failed to restore WinKeyServer.exe:", e);
    return null;
  }
  return findExistingWinKeyServerExe();
}

function charFromEvent(e: IGlobalKeyEvent): string | null {
  const name = e.name;
  if (name && name.length === 1 && /^[A-Z0-9]$/.test(name)) {
    return name;
  }
  if (name && NUMPAD_CHARS[name]) {
    return NUMPAD_CHARS[name];
  }
  if (name && NAMED_CHARS[name]) {
    return NAMED_CHARS[name];
  }
  const raw = e.rawKey?.name;
  if (raw && raw.length === 1) {
    return raw;
  }
  return null;
}

function stopKeyboard(): void {
  keyboardInstance?.kill();
  keyboardInstance = null;
  listenerReady = false;
}

export function isKeyboardListenerActive(): boolean {
  return listenerReady;
}

function logSpawnFailureHint(err: unknown): void {
  const e = err as NodeJS.ErrnoException & { code?: string };
  if (e?.code === "UNKNOWN" || e?.errno === -4094) {
    const cwd = process.cwd();
    if (/OneDrive|iCloud|Dropbox|Google Drive/i.test(cwd)) {
      console.error(
        "[keyboard] Project path is under cloud sync; move the repo to a local folder (e.g. C:\\dev\\plc-ts) and retry."
      );
    } else {
      console.error(
        "[keyboard] spawn UNKNOWN often means Windows blocked WinKeyServer.exe (SmartScreen/antivirus) or the .exe is corrupt; unblock the file or run: node scripts/ensure-win-keyserver.mjs"
      );
    }
  }
}

export async function connectKeyboard(slot: (barcode: string) => void): Promise<void> {
  stopKeyboard();

  let GlobalKeyboardListener: typeof import("node-global-key-listener").GlobalKeyboardListener;
  try {
    ({ GlobalKeyboardListener } = await import("node-global-key-listener"));
  } catch (err) {
    console.error("[keyboard] node-global-key-listener unavailable:", err);
    return;
  }

  let winServerPath: string | undefined;
  if (process.platform === "win32") {
    const exe = await resolveOrRestoreWinKeyServerExe();
    if (!exe) {
      console.error("[keyboard] WinKeyServer.exe still missing after restore attempt. Run: npm install && node scripts/ensure-win-keyserver.mjs");
      return;
    }
    winServerPath = exe;
  }

  let buffer = "";

  const flush = () => {
    const code = buffer.trim();
    buffer = "";
    if (code.length > 0) {
      slot(code);
    }
  };

  const onKey = (e: IGlobalKeyEvent, _isDown: IGlobalKeyDownMap) => {
    if (e.state !== "DOWN") {
      return false;
    }
    const name = e.name ?? "";

    if (name === "RETURN" || name === "NUMPAD RETURN") {
      flush();
      return false;
    }
    if (name === "BACKSPACE") {
      buffer = buffer.slice(0, -1);
      return false;
    }
    if (name === "ESCAPE") {
      buffer = "";
      return false;
    }

    const ch = charFromEvent(e);
    if (ch === null) {
      return false;
    }
    if (buffer.length < MAX_BARCODE_LEN) {
      buffer += ch;
    }
    return false;
  };

  const v = new GlobalKeyboardListener({
    windows: {
      serverPath: winServerPath,
      onError: (code) => console.error("[keyboard] windows:", code),
      onInfo: (info) => console.info("[keyboard] windows:", info),
    },
    mac: {
      onError: (code) => console.error("[keyboard] mac:", code),
    },
  });

  try {
    await v.addListener(onKey);
    keyboardInstance = v;
    listenerReady = true;
  } catch (err) {
    console.error("[keyboard] failed to start listener:", err);
    logSpawnFailureHint(err);
    try {
      v.kill();
    } catch {
      /* WinKeyServer.proc may be undefined if execFile never started */
    }
  }
}
