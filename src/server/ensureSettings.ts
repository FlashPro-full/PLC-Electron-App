import fs from "fs";
import path from "path";

const DEFAULT_SETTINGS = {
  belt_speed: 32.1,
  pushers: {
    "Pusher 1": { label: "None", distance: 0 },
    "Pusher 2": { label: "None", distance: 0 },
    "Pusher 3": { label: "None", distance: 0 },
    "Pusher 4": { label: "None", distance: 0 },
    "Pusher 5": { label: "None", distance: 0 },
    "Pusher 6": { label: "None", distance: 0 },
    "Pusher 7": { label: "None", distance: 0 },
    "Pusher 8": { label: "None", distance: 0 },
  },
};

export function ensureSettingsFile(): void {
  const p = path.join(process.cwd(), "settings.json");
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8");
  }
}
