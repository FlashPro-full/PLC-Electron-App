import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

await esbuild.build({
  entryPoints: [path.join(root, "src", "client", "script.ts")],
  bundle: false,
  outfile: path.join(root, "public", "static", "script.js"),
  format: "iife",
  platform: "browser",
  target: "es2020",
});

console.log("bundled src/client/script.ts -> public/static/script.js");
