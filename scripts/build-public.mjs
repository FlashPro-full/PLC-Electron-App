import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const plcTsRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(plcTsRoot, "..");
const pub = path.join(plcTsRoot, "public");
const staticDst = path.join(pub, "static");

function firstDir(...candidates) {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        return p;
      }
    } catch {
      /* continue */
    }
  }
  return null;
}

const staticSrc = firstDir(path.join(plcTsRoot, "static"), path.join(repoRoot, "static"));
fs.mkdirSync(staticDst, { recursive: true });
if (staticSrc) {
  fs.cpSync(staticSrc, staticDst, { recursive: true });
}

const templatesDir = firstDir(path.join(plcTsRoot, "templates"), path.join(repoRoot, "templates"));
if (!templatesDir) {
  if (!fs.existsSync(path.join(pub, "index.html")) || !fs.existsSync(path.join(pub, "settings.html"))) {
    throw new Error(
      "No templates/ under plc-ts or parent repo, and public/index.html or public/settings.html is missing."
    );
  }
  console.log("public/: no external templates; kept existing HTML and static");
} else {
const index = fs
  .readFileSync(path.join(templatesDir, "index.html"), "utf8")
  .replace(/\{\{\s*url_for\('static',\s*filename='([^']+)'\)\s*\}\}/g, "/static/$1");
fs.writeFileSync(path.join(pub, "index.html"), index);

const DISTANCE_LABELS = [
  "FBA",
  "MF",
  "Reject Blu-ray",
  "Reject Book",
  "Reject Music",
  "Reject DVD",
  "Reject Video Game",
  "Extra",
  "None",
];
const DEFAULT_PUSHERS = [
  "Pusher 1",
  "Pusher 2",
  "Pusher 3",
  "Pusher 4",
  "Pusher 5",
  "Pusher 6",
  "Pusher 7",
  "Pusher 8",
];

function fieldsetHtml(pusher) {
  const options = DISTANCE_LABELS.map((label) => `<option value="${label}">${label}</option>`).join("\n");
  return `<fieldset class="fieldset-card">
            <legend>${pusher}</legend>
            <div class="field-group">
              <label for="${pusher}_label">Label</label>
              <select id="${pusher}_label" name="${pusher}[label]" required>
                ${options}
              </select>
            </div>
            <div class="field-group">
                <label for="${pusher}_distance">Distance (cm)</label>
                <input type="number" step="0.001" id="${pusher}_distance" name="${pusher}[distance]" required>
            </div>
          </fieldset>`;
}

const gridInner = DEFAULT_PUSHERS.map(fieldsetHtml).join("\n\n");

let settingsTpl = fs.readFileSync(path.join(templatesDir, "settings.html"), "utf8");
settingsTpl = settingsTpl.replace(/\{\{\s*url_for\('static',\s*filename='([^']+)'\)\s*\}\}/g, "/static/$1");
settingsTpl = settingsTpl.replace(
  /\s*\{%\s*for\s+pusher\s+in\s+pushers\s*%\}[\s\S]*?\{%\s*endfor\s*%\}\s*/m,
  `\n${gridInner}\n`
);
fs.writeFileSync(path.join(pub, "settings.html"), settingsTpl);

console.log("public/: copied static, wrote index.html + settings.html");
}
