import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packagingDir = path.join(root, "packaging");
const dbPath = path.join(packagingDir, "plc.sqlite");

fs.mkdirSync(packagingDir, { recursive: true });
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    belt_speed REAL NOT NULL DEFAULT 32.1
  );
`);
db.prepare("INSERT INTO app_settings (id, belt_speed) VALUES (1, ?)").run(32.1);
db.close();
