"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { NtExecutable, NtExecutableResource, Resource, Data } = require("resedit");

function appBuilderPath(projectDir) {
  const osDir = process.platform === "win32" ? "win" : process.platform;
  return path.join(
    projectDir,
    "node_modules",
    "app-builder-bin",
    osDir,
    process.arch,
    process.platform === "win32" ? "app-builder.exe" : "app-builder",
  );
}

/**
 * Build the same ICO electron-builder would use (via app-builder), then patch every
 * RT_ICON_GROUP in the main exe with `resedit`. Avoids relying on `png-to-ico` alone,
 * which can produce ICO data Explorer does not use for the file icon.
 *
 * @param {import("builder-util").PackContext} context
 */
module.exports = async (context) => {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.projectDir;
  const pngPath = path.join(projectDir, "build", "icon.png");
  if (!fs.existsSync(pngPath)) {
    console.warn("[patch-win-unpacked-icon] build/icon.png missing; skipping exe icon.");
    return;
  }

  const productFilename = context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  if (!fs.existsSync(exePath)) {
    console.warn("[patch-win-unpacked-icon] exe not found:", exePath);
    return;
  }

  const appBuilder = appBuilderPath(projectDir);
  if (!fs.existsSync(appBuilder)) {
    console.warn("[patch-win-unpacked-icon] app-builder not found:", appBuilder);
    return;
  }

  const tmpOut = path.join(projectDir, "out", `.plc-exe-ico-${process.pid}`);
  fs.mkdirSync(tmpOut, { recursive: true });
  let icoBuf;
  try {
    execFileSync(
      appBuilder,
      [
        "icon",
        "--format",
        "ico",
        "--root",
        projectDir,
        "--out",
        tmpOut,
        "--input",
        "build/icon.png",
      ],
      { stdio: "pipe" },
    );
    const icoPath = path.join(tmpOut, "icon.ico");
    if (!fs.existsSync(icoPath)) {
      throw new Error(`missing ${icoPath}`);
    }
    icoBuf = fs.readFileSync(icoPath);
  } catch (e) {
    console.warn("[patch-win-unpacked-icon] app-builder icon failed, falling back to png-to-ico:", e.message);
    const pngToIco = (await import("png-to-ico")).default;
    icoBuf = Buffer.from(await pngToIco(pngPath));
  } finally {
    try {
      fs.rmSync(tmpOut, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const iconImagesFromIco = () => Data.IconFile.from(icoBuf).icons.map((item) => item.data);

  const buffer = fs.readFileSync(exePath);
  const exe = NtExecutable.from(buffer, { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  const seen = new Set();
  const targets = [];
  for (const e of res.entries) {
    if (e.type !== 14) {
      continue;
    }
    const key = `${String(e.id)}\0${e.lang}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push({ id: e.id, lang: e.lang });
  }

  targets.sort((a, b) => {
    const na = typeof a.id === "number" ? a.id : 99999;
    const nb = typeof b.id === "number" ? b.id : 99999;
    return na - nb;
  });

  if (targets.length === 0) {
    Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconImagesFromIco());
  } else {
    for (const { id, lang } of targets) {
      Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, iconImagesFromIco());
    }
  }

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log("[patch-win-unpacked-icon] Updated exe icon:", exePath, targets.length ? `(groups: ${targets.map((t) => `${t.id}/${t.lang}`).join(", ")})` : "(created group 1/1033)");
};
