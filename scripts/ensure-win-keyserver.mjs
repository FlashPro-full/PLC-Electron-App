import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { restoreWinKeyServer } = require("./ngkl-extract-win.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pkgRoot = path.join(root, "node_modules", "node-global-key-listener");

if (process.platform !== "win32") {
  process.exit(0);
}
if (!fs.existsSync(pkgRoot)) {
  process.exit(0);
}

const exe = path.join(pkgRoot, "bin", "WinKeyServer.exe");
if (fs.existsSync(exe)) {
  process.exit(0);
}

restoreWinKeyServer(pkgRoot)
  .then((ok) => {
    if (ok) {
      console.log("[postinstall] restored node-global-key-listener/bin/WinKeyServer.exe");
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error("[postinstall] could not restore WinKeyServer.exe:", e.message);
    console.error("  Try: npm install node-global-key-listener@0.3.0 --force");
    console.error("  Or allow the file in Windows Security if it was quarantined.");
    process.exit(0);
  });
