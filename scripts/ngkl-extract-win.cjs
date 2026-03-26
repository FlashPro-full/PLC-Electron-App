"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ENTRY = "package/bin/WinKeyServer.exe";

function readTarEntry(tar, wantPath) {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    let name = header.subarray(0, 100).toString("utf8").split("\0")[0];
    const prefix = header.subarray(345, 500).toString("utf8").split("\0")[0];
    if (prefix) {
      name = `${prefix}/${name}`;
    }
    const sizeRaw = header
      .subarray(124, 136)
      .toString("utf8")
      .trim()
      .replace(/\0/g, "");
    const size = parseInt(sizeRaw, 8) || 0;
    offset += 512;
    const content = tar.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (name === wantPath || name.replace(/\\/g, "/") === wantPath) {
      return Buffer.from(content);
    }
  }
  return null;
}

/**
 * @param {string} pkgRoot absolute path to node_modules/node-global-key-listener
 * @returns {Promise<boolean>}
 */
async function restoreWinKeyServer(pkgRoot) {
  if (process.platform !== "win32") {
    return false;
  }
  if (!fs.existsSync(pkgRoot)) {
    return false;
  }
  const exe = path.join(pkgRoot, "bin", "WinKeyServer.exe");
  if (fs.existsSync(exe)) {
    return true;
  }
  const pkgJson = path.join(pkgRoot, "package.json");
  if (!fs.existsSync(pkgJson)) {
    return false;
  }
  const version = JSON.parse(fs.readFileSync(pkgJson, "utf8")).version;
  const url = `https://registry.npmjs.org/node-global-key-listener/-/node-global-key-listener-${version}.tgz`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const tgz = Buffer.from(await res.arrayBuffer());
  if (tgz.length < 10_000) {
    throw new Error(`download too small (${tgz.length} bytes)`);
  }
  const tar = zlib.gunzipSync(tgz);
  const exeBuf = readTarEntry(tar, ENTRY);
  if (!exeBuf || exeBuf.length < 1000) {
    throw new Error(`missing or invalid ${ENTRY} in npm tarball`);
  }
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, exeBuf);
  return true;
}

module.exports = { restoreWinKeyServer, readTarEntry, ENTRY };
