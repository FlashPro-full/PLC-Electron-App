import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const target = path.join(root, "node_modules", "@electron", "node-gyp", "lib", "find-visualstudio.js");

const MARKER = "plc-ts: Visual Studio 18 (2026) support";

function main() {
  if (!fs.existsSync(target)) {
    return;
  }
  let s = fs.readFileSync(target, "utf8");
  if (s.includes(MARKER)) {
    return;
  }

  const orig = s;

  s = s.replaceAll(
    "return this.findVSFromSpecifiedLocation([2019, 2022])",
    `return this.findVSFromSpecifiedLocation([2019, 2022, 2026]) // ${MARKER}`
  );
  s = s.replaceAll(
    "return this.findNewVSUsingSetupModule([2019, 2022])",
    `return this.findNewVSUsingSetupModule([2019, 2022, 2026]) // ${MARKER}`
  );
  s = s.replaceAll(
    "return this.findNewVS([2019, 2022])",
    `return this.findNewVS([2019, 2022, 2026]) // ${MARKER}`
  );

  s = s.replace(
    `    if (ret.versionMajor === 17) {
      ret.versionYear = 2022
      return ret
    }
    this.log.silly('- unsupported version:', ret.versionMajor)`,
    `    if (ret.versionMajor === 17) {
      ret.versionYear = 2022
      return ret
    }
    if (ret.versionMajor === 18) {
      ret.versionYear = 2026
      return ret
    }
    this.log.silly('- unsupported version:', ret.versionMajor)`
  );

  s = s.replace(
    `    } else if (versionYear === 2022) {
      return 'v143'
    }
    this.log.silly('- invalid versionYear:', versionYear)`,
    `    } else if (versionYear === 2022) {
      return 'v143'
    } else if (versionYear === 2026) {
      return 'v143'
    }
    this.log.silly('- invalid versionYear:', versionYear)`
  );

  if (s === orig) {
    console.warn("patch-node-gyp-vs18: find-visualstudio.js did not match expected content; skip.");
    return;
  }

  fs.writeFileSync(target, s, "utf8");
  console.log("patched @electron/node-gyp for Visual Studio 18 (2026).");
}

main();
