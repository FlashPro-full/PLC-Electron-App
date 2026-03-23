import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_NAME = "plc.sqlite";

function sqlitePath(): string {
  return path.join(process.cwd(), "data", DB_NAME);
}

let db: Database.Database | null = null;

function openDb(): Database.Database {
  if (db) return db;
  const file = sqlitePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      belt_speed REAL NOT NULL DEFAULT 32.1
    );
  `);
  const row = db.prepare("SELECT belt_speed FROM app_settings WHERE id = 1").get() as
    | { belt_speed: number }
    | undefined;
  if (!row) {
    let speed = 32.1;
    try {
      const settingsPath = path.join(process.cwd(), "settings.json");
      if (fs.existsSync(settingsPath)) {
        const j = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as { belt_speed?: number };
        if (typeof j.belt_speed === "number" && !Number.isNaN(j.belt_speed)) {
          speed = j.belt_speed;
        }
      }
    } catch {}
    db.prepare("INSERT INTO app_settings (id, belt_speed) VALUES (1, ?)").run(speed);
  }
  return db;
}

export function ensureSqlite(): void {
  openDb();
}

export function getBeltSpeedFromDb(): number {
  const row = openDb().prepare("SELECT belt_speed FROM app_settings WHERE id = 1").get() as
    | { belt_speed: number }
    | undefined;
  return row != null && typeof row.belt_speed === "number" ? row.belt_speed : 32.1;
}

export function setBeltSpeedInDb(speed: number): void {
  openDb().prepare("UPDATE app_settings SET belt_speed = ? WHERE id = 1").run(speed);
}
