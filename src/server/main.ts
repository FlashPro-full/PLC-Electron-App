import dotenv from "dotenv";
import path from "path";
import { createPlcHttpServer } from "./httpServer";
import { ensureSettingsFile } from "./ensureSettings";
import { ensureSqlite } from "./settingsDb";
import { isPlcConnected } from "./plc";

function resolveRoot(): string {
  return process.env.PLC_APP_ROOT || process.cwd();
}

const root = resolveRoot();
process.chdir(root);
dotenv.config({ path: path.join(root, ".env") });

ensureSettingsFile();
ensureSqlite();

const publicDir = path.join(__dirname, "..", "..", "public");
const host = process.env.FLASK_HOST || "0.0.0.0";
const port = parseInt(process.env.FLASK_PORT || process.env.PLC_PORT || "5000", 10);

export async function runServer(): Promise<void> {
  const { start } = createPlcHttpServer(publicDir);

  await start(port, host);

  console.log(`PLC-TS listening on http://${host}:${port}`);
  console.log(`plc connected: ${isPlcConnected()}`);
}

if (require.main === module) {
  runServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
