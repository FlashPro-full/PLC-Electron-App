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
const MEMORY_DIAG_LOG_MS = 60_000;

ensureBeltSettingsFile();
ensureDeviceSettingsFile();
ensurePurescanSettingsFile();
resolvedPurescan();

process.on("unhandledRejection", (reason) => {
  console.error("[diag] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[diag] Uncaught exception:", error);
});

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function startMemoryDiagnostics(): void {
  let maxRss = 0;
  let maxHeapUsed = 0;

  setInterval(() => {
    const m = process.memoryUsage();
    maxRss = Math.max(maxRss, m.rss);
    maxHeapUsed = Math.max(maxHeapUsed, m.heapUsed);

    console.log(
      `[diag][memory] rss=${formatMb(m.rss)} heapUsed=${formatMb(m.heapUsed)} heapTotal=${formatMb(m.heapTotal)} external=${formatMb(m.external)} arrayBuffers=${formatMb(m.arrayBuffers)} maxRss=${formatMb(maxRss)} maxHeapUsed=${formatMb(maxHeapUsed)} uptimeSec=${Math.floor(process.uptime())}`
    );
  }, MEMORY_DIAG_LOG_MS);
}

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

  startMemoryDiagnostics();
  console.log(`Belt-System listening on http://${host}:${port}`);
}

if (require.main === module) {
  runServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
