const { EventEmitter } = require("node:events");

const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 30,
  shortBreakMinutes: 3,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  snoozeMinutes: 5,
  idleBreakMinutes: 3,
  language: "en",
  launchAtLogin: false,
  soundEnabled: false,
  treatIdleAsBreak: false,
});

const LIMITS = Object.freeze({
  workMinutes: [1, 180],
  shortBreakMinutes: [1, 30],
  longBreakMinutes: [3, 60],
  longBreakEvery: [1, 12],
  snoozeMinutes: [1, 30],
  idleBreakMinutes: [1, 30],
});

function clampInteger(value, fallback, [minimum, maximum]) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeSettings(input = {}) {
  const normalized = { ...DEFAULT_SETTINGS };

  for (const [key, limits] of Object.entries(LIMITS)) {
    normalized[key] = clampInteger(input[key], DEFAULT_SETTINGS[key], limits);
  }

  normalized.language = input.language === "zh-CN" ? "zh-CN" : "en";
  normalized.launchAtLogin = Boolean(input.launchAtLogin);
  normalized.soundEnabled = Boolean(input.soundEnabled);
  normalized.treatIdleAsBreak = Boolean(input.treatIdleAsBreak);

  return normalized;
}

class TimerEngine extends EventEmitter {
  constructor(settings = {}) {
    super();
    this.settings = normalizeSettings(settings);
    this.status = "ready";
    this.remainingSeconds = 0;
    this.phaseTotalSeconds = 0;
    this.completedWorkSessions = 0;
    this.completedBreaks = 0;
    this.skippedBreaks = 0;
    this.longBreakOwed = false;
    this.pendingBreakType = "short";
    this.pausedState = null;
    this.pauseReason = null;
  }

  snapshot() {
    return {
      status: this.status,
      remainingSeconds: this.remainingSeconds,
      phaseTotalSeconds: this.phaseTotalSeconds,
      completedWorkSessions: this.completedWorkSessions,
      completedBreaks: this.completedBreaks,
      skippedBreaks: this.skippedBreaks,
      pendingBreakType: this.pendingBreakType,
      longBreakOwed: this.longBreakOwed,
      pauseReason: this.pauseReason,
      settings: { ...this.settings },
    };
  }

  emitChange() {
    this.emit("change", this.snapshot());
  }

  updateSettings(settings) {
    this.settings = normalizeSettings({ ...this.settings, ...settings });
    this.emitChange();
    return this.snapshot();
  }

  startWork() {
    if (this.status === "breaking") return false;
    this.status = "working";
    this.phaseTotalSeconds = this.settings.workMinutes * 60;
    this.remainingSeconds = this.phaseTotalSeconds;
    this.pausedState = null;
    this.pauseReason = null;
    this.emitChange();
    return true;
  }

  startBreak() {
    if (!new Set(["break_due", "snoozed"]).has(this.status)) return false;
    this.pendingBreakType = this.longBreakOwed ? "long" : "short";
    this.status = "breaking";
    this.phaseTotalSeconds =
      (this.pendingBreakType === "long"
        ? this.settings.longBreakMinutes
        : this.settings.shortBreakMinutes) * 60;
    this.remainingSeconds = this.phaseTotalSeconds;
    this.emitChange();
    return true;
  }

  snooze() {
    if (this.status !== "break_due") return false;
    this.status = "snoozed";
    this.phaseTotalSeconds = this.settings.snoozeMinutes * 60;
    this.remainingSeconds = this.phaseTotalSeconds;
    this.emitChange();
    return true;
  }

  skipBreak() {
    if (!new Set(["break_due", "snoozed"]).has(this.status)) return false;
    this.skippedBreaks += 1;
    this.startWork();
    return true;
  }

  finishBreakEarly() {
    if (this.status !== "breaking") return false;
    this.status = "break_complete";
    this.remainingSeconds = 0;
    this.phaseTotalSeconds = 0;
    this.emitChange();
    return true;
  }

  pause(reason = "user") {
    if (!new Set(["working", "snoozed", "breaking"]).has(this.status)) return false;
    this.pausedState = this.status;
    this.status = "paused";
    this.pauseReason = reason;
    this.emitChange();
    return true;
  }

  resume() {
    if (this.status !== "paused" || !this.pausedState) return false;
    this.status = this.pausedState;
    this.pausedState = null;
    this.pauseReason = null;
    this.emitChange();
    return true;
  }

  registerNaturalBreak(durationSeconds) {
    const duration = Math.max(0, Number(durationSeconds) || 0);
    const stateBeforeBreak = this.status === "paused" ? this.pausedState : this.status;
    const followedActiveUse = new Set(["working", "snoozed", "breaking", "break_due"]).has(stateBeforeBreak);
    const completedLongBreak =
      followedActiveUse && this.longBreakOwed && duration >= this.settings.longBreakMinutes * 60;

    if (completedLongBreak) this.longBreakOwed = false;
    if (followedActiveUse && duration >= this.settings.shortBreakMinutes * 60) {
      this.completedBreaks += 1;
    }

    this.status = "ready";
    this.remainingSeconds = 0;
    this.phaseTotalSeconds = 0;
    this.pausedState = null;
    this.pauseReason = null;
    this.pendingBreakType = this.longBreakOwed ? "long" : "short";
    this.emitChange();
    return true;
  }

  tick(seconds = 1) {
    if (!new Set(["working", "snoozed", "breaking"]).has(this.status)) {
      return this.snapshot();
    }

    const elapsed = Math.max(1, Number.parseInt(seconds, 10) || 1);
    this.remainingSeconds = Math.max(0, this.remainingSeconds - elapsed);

    if (this.remainingSeconds > 0) {
      this.emitChange();
      return this.snapshot();
    }

    if (this.status === "working") {
      this.completedWorkSessions += 1;
      if (this.completedWorkSessions % this.settings.longBreakEvery === 0) {
        this.longBreakOwed = true;
      }
      this.pendingBreakType = this.longBreakOwed ? "long" : "short";
      this.status = "break_due";
      this.phaseTotalSeconds = 0;
    } else if (this.status === "snoozed") {
      this.status = "break_due";
      this.phaseTotalSeconds = 0;
    } else if (this.status === "breaking") {
      this.completedBreaks += 1;
      if (this.pendingBreakType === "long") this.longBreakOwed = false;
      this.status = "break_complete";
      this.phaseTotalSeconds = 0;
    }

    this.emitChange();
    return this.snapshot();
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  TimerEngine,
  normalizeSettings,
};
