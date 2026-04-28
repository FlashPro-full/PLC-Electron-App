import dotenv from "dotenv";
import path from "path";
import { createHttpServer } from "./http/httpServer";
import { disconnectCognex } from "./input/tcp";
import { ensureBeltSettingsFile } from "./persistence/beltSettings";
import { ensureDeviceSettingsFile } from "./persistence/deviceSettings";
import { ensurePurescanSettingsFile } from "./persistence/purescanSettings";
import { resolvedPurescan } from "./integrations/purescan";

function resolveRoot(): string {
  return process.env.PLC_APP_ROOT || process.cwd();
}

const root = resolveRoot();
process.chdir(root);
dotenv.config({ path: path.join(root, ".env") });

const clientDir = path.join(__dirname, "..", "..", "dist", "client");
const host = "127.0.0.1";
const port = 5049;

ensureBeltSettingsFile();
ensureDeviceSettingsFile();
ensurePurescanSettingsFile();
resolvedPurescan();

export async function runServer(): Promise<void> {
  const { server } = createHttpServer(clientDir);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const shutdown = (): void => {
    disconnectCognex();
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  console.log(`Belt-System listening on http://${host}:${port}`);
}

if (require.main === module) {
  runServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
