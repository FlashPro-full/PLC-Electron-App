import fs from "fs";
import path from "path";

const BELT_SETTINGS_FILE = "settings.json";

const DEFAULT_SETTINGS = {
  pushers: {
    "Pusher 1": {
      label: "Reject Video Game",
      distance: 217,
    },
    "Pusher 2": {
      label: "Reject Book",
      distance: 301,
    },
    "Pusher 3": {
      label: "Reject DVD",
      distance: 387,
    },
    "Pusher 4": {
      label: "FBA",
      distance: 468,
    },
    "Pusher 5": {
      label: "Reject Music",
      distance: 590,
    },
    "Pusher 6": {
      label: "MF",
      distance: 710,
    },
    "Pusher 7": {
      label: "Reject Blu-ray",
      distance: 809,
    },
    "Pusher 8": {
      label: "None",
      distance: 972,
    },
  },
  belt_speed: 32.0,
  distance: 50
};

type beltSettingsType = typeof DEFAULT_SETTINGS;
type pushersType = typeof DEFAULT_SETTINGS["pushers"];

export function ensureBeltSettingsFile(): void {
  try {
    const p = path.join(process.cwd(), BELT_SETTINGS_FILE);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf8");
    }
  } catch (err) {
    console.log(`Error ensuring belt settings file: ${err}`);
  }
}

export function getBeltSettings(): beltSettingsType {
  try {
    const p = path.join(process.cwd(), BELT_SETTINGS_FILE);
    if (!fs.existsSync(p)) {
      return DEFAULT_SETTINGS;
    }
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as beltSettingsType;
  } catch (err) {
    console.log(`Error getting belt settings: ${err}`);
    return DEFAULT_SETTINGS;
  }
}

export function getBeltSpeed(): number {
  try {
    return getBeltSettings().belt_speed;
  } catch (err) {
    console.log(`Error getting belt speed: ${err}`);
    return DEFAULT_SETTINGS.belt_speed;
  }
}

export function updateBeltSpeed(speed: number): void {
  try {
    const p = path.join(process.cwd(), BELT_SETTINGS_FILE);
    const raw = fs.readFileSync(p, "utf8");
    const settings = JSON.parse(raw) as beltSettingsType;
    settings.belt_speed = speed;
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    console.log(`Error updating belt speed: ${err}`);
  }
}

export function getDistance(): number {
  try {
    return getBeltSettings().distance;
  } catch (err) {
    console.log(`Error getting distance: ${err}`);
    return DEFAULT_SETTINGS.distance;
  }
}

export function updateDistance(distance: number): void {
  try {
    const p = path.join(process.cwd(), BELT_SETTINGS_FILE);
    const raw = fs.readFileSync(p, "utf8");
    const settings = JSON.parse(raw) as beltSettingsType;
    settings.distance = distance;
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    console.log(`Error updating distance: ${err}`);
  }
}

export function getPushers(): pushersType {
  try {
    return getBeltSettings().pushers;
  } catch (err) {
    console.log(`Error getting pushers: ${err}`);
    return DEFAULT_SETTINGS.pushers;
  }
}

export function updatePushers(pushers: pushersType): void {
  try {
    const p = path.join(process.cwd(), BELT_SETTINGS_FILE);
    const raw = fs.readFileSync(p, "utf8");
    const settings = JSON.parse(raw) as beltSettingsType;
    settings.pushers = pushers;
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    console.log(`Error updating pusher settings: ${err}`);
  }
}