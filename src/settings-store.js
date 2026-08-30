const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS, normalizeSettings } = require("./core/timer-engine");

class SettingsStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, "settings.json");
    this.settings = this.read();
  }

  read() {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return normalizeSettings(value);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  get() {
    return { ...this.settings };
  }

  update(nextSettings) {
    this.settings = normalizeSettings({ ...this.settings, ...nextSettings });
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.settings, null, 2)}\n`, {
      mode: 0o600,
    });
    return this.get();
  }
}

module.exports = { SettingsStore };
