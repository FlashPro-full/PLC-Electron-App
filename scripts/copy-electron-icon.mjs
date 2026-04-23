import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "build", "icon.png");
const dest = path.join(root, "dist", "electron", "icon.png");

if (!fs.existsSync(src)) {
  console.warn(
    "[plc-ts] Missing build/icon.png — add it for the Windows .exe icon and the Electron window icon.\n" +
      "         See: one PNG (≥256×256, square) at: " +
      path.relative(process.cwd(), src),
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
