const translations = {
  en: {
    settings: "Settings", workDuration: "Work duration", shortBreak: "Short break", longBreak: "Long break",
    longBreakEvery: "Long break every", cycles: "cycles", snoozeFor: "Snooze for", language: "Language",
    launchAtLogin: "Launch at login", showOnFullscreen: "Show reminders in fullscreen",
    idleAsBreak: "Treat inactivity as a break", idleThreshold: "Inactivity threshold",
    saveSettings: "Save settings", readyTitle: "Ready", startSession: "Start", workingTitle: "Working", pause: "Pause",
    pausedTitle: "Paused", resume: "Resume", dueTitle: "Break", startBreak: "Start", snooze: "+{snooze} min",
    skip: "Skip", snoozedTitle: "Snoozed", breakTitle: "Break", longBreakTitle: "Break", finishEarly: "End",
    completeTitle: "Done", settingsSaved: "Saved", openSettings: "Open settings", closeSettings: "Close settings",
  },
  "zh-CN": {
    settings: "设置", workDuration: "工作时长", shortBreak: "短休息", longBreak: "长休息",
    longBreakEvery: "长休息间隔", cycles: "个周期", snoozeFor: "延后提醒", language: "语言",
    launchAtLogin: "登录时启动", showOnFullscreen: "全屏时显示提醒",
    idleAsBreak: "将无操作视为休息", idleThreshold: "无操作阈值",
    saveSettings: "保存设置", readyTitle: "准备", startSession: "开始", workingTitle: "工作中", pause: "暂停",
    pausedTitle: "已暂停", resume: "继续", dueTitle: "休息", startBreak: "开始", snooze: "+{snooze} 分钟",
    skip: "跳过", snoozedTitle: "已延后", breakTitle: "休息", longBreakTitle: "休息", finishEarly: "结束",
    completeTitle: "完成", settingsSaved: "已保存", openSettings: "打开设置", closeSettings: "收起设置",
  },
};

const breakTips = {
  en: [
    "Look at something at least 6 metres away.",
    "Blink slowly and completely.",
    "Stand up and relax your shoulders.",
    "Walk around and let your eyes rest.",
    "Breathe slowly and loosen your neck.",
  ],
  "zh-CN": [
    "望向至少 6 米以外的地方。",
    "缓慢、完整地眨几次眼。",
    "站起来，放松肩膀。",
    "走动一下，让眼睛休息。",
    "慢慢呼吸，放松颈部。",
  ],
};

const params = new URLSearchParams(window.location.search);
const isReminder = params.get("mode") === "reminder";
if (isReminder) document.body.classList.add("reminder");

const statusTitle = document.querySelector("#status-title");
const timer = document.querySelector("#timer");
const progressTrack = document.querySelector("#progress-track");
const progressBar = document.querySelector("#progress-bar");
const actions = document.querySelector("#actions");
const settingsForm = document.querySelector("#settings-form");
const saveMessage = document.querySelector("#save-message");
const idleMinutesRow = document.querySelector("#idle-minutes-row");
const fullscreenRemindersRow = document.querySelector("#fullscreen-reminders-row");
const settingsToggle = document.querySelector("#settings-toggle");
const breakStripTimer = document.querySelector("#break-strip-timer");
const breakTip = document.querySelector("#break-tip");

let currentLanguage = "en";
let settingsOpen = false;
let breakTipIndex = 0;
let breakTipInterval;

if (fullscreenRemindersRow) {
  fullscreenRemindersRow.hidden = window.eyeProtect.platform !== "darwin";
}

function t(key, values = {}) {
  let value = translations[currentLanguage]?.[key] ?? translations.en[key] ?? key;
  for (const [name, replacement] of Object.entries(values)) {
    value = value.replace(`{${name}}`, replacement);
  }
  return value;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function makeButton(label, command, style = "ghost") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${style}`;
  button.textContent = label;
  button.addEventListener("click", () => {
    if (command === "start-work" && settingsOpen) setSettingsState(false);
    window.eyeProtect.command(command);
  });
  return button;
}

function renderActions(state) {
  actions.replaceChildren();
  if (new Set(["ready", "break_complete"]).has(state.status)) {
    actions.append(makeButton(t("startSession"), "start-work", "primary"));
  } else if (state.status === "working") {
    actions.append(makeButton(t("pause"), "pause", "ghost"));
  } else if (state.status === "paused") {
    actions.append(makeButton(t("resume"), "resume", "primary"));
  } else if (state.status === "break_due") {
    const breakMinutes = state.pendingBreakType === "long" ? state.settings.longBreakMinutes : state.settings.shortBreakMinutes;
    actions.append(
      makeButton(t("startBreak", { break: breakMinutes }), "start-break", "primary"),
      makeButton(t("snooze", { snooze: state.settings.snoozeMinutes }), "snooze", "secondary"),
      makeButton(t("skip"), "skip", "ghost"),
    );
  } else if (state.status === "snoozed") {
    const breakMinutes = state.pendingBreakType === "long" ? state.settings.longBreakMinutes : state.settings.shortBreakMinutes;
    actions.append(
      makeButton(t("startBreak", { break: breakMinutes }), "start-break", "primary"),
      makeButton(t("skip"), "skip", "ghost"),
    );
  } else if (state.status === "breaking") {
    actions.append(makeButton(t("finishEarly"), "finish-break", "ghost"));
  }
}

function renderState(state) {
  currentLanguage = state.settings.language;
  document.documentElement.lang = currentLanguage;
  applyTranslations();
  for (const status of ["ready", "working", "paused", "break_due", "snoozed", "breaking", "break_complete"]) {
    document.body.classList.remove(`state-${status}`);
  }
  document.body.classList.add(`state-${state.status}`);
  document.body.classList.toggle("is-breaking", state.status === "breaking");

  const title = {
    ready: t("readyTitle"),
    working: t("workingTitle"),
    paused: t("pausedTitle"),
    break_due: t("dueTitle"),
    snoozed: t("snoozedTitle"),
    breaking: t(state.pendingBreakType === "long" ? "longBreakTitle" : "breakTitle"),
    break_complete: t("completeTitle"),
  }[state.status];

  statusTitle.textContent = title ?? t("readyTitle");

  const displaySeconds = state.status === "ready"
    ? state.settings.workMinutes * 60
    : state.status === "break_due"
      ? (state.pendingBreakType === "long" ? state.settings.longBreakMinutes : state.settings.shortBreakMinutes) * 60
      : state.status === "break_complete"
        ? null
        : state.remainingSeconds;
  const timed = new Set(["working", "snoozed", "breaking", "paused"]).has(state.status) && state.phaseTotalSeconds > 0;
  timer.hidden = displaySeconds === null;
  progressTrack.hidden = !timed;
  if (displaySeconds !== null) {
    timer.textContent = formatTime(displaySeconds);
  }
  if (timed) {
    const percent = state.phaseTotalSeconds > 0 ? (state.remainingSeconds / state.phaseTotalSeconds) * 100 : 0;
    progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
  breakStripTimer.textContent = formatTime(state.remainingSeconds);
  updateBreakTipRotation(state.status === "breaking");

  renderActions(state);
}

function renderBreakTip() {
  const tips = breakTips[currentLanguage] ?? breakTips.en;
  breakTip.textContent = tips[breakTipIndex % tips.length];
}

function updateBreakTipRotation(active) {
  if (!active) {
    if (breakTipInterval) clearInterval(breakTipInterval);
    breakTipInterval = undefined;
    breakTipIndex = 0;
    return;
  }

  renderBreakTip();
  if (breakTipInterval) return;
  breakTipInterval = setInterval(() => {
    breakTip.classList.add("is-changing");
    setTimeout(() => {
      breakTipIndex += 1;
      renderBreakTip();
      breakTip.classList.remove("is-changing");
    }, 180);
  }, 6_000);
}

function setSettingsState(open) {
  settingsOpen = Boolean(open);
  document.body.classList.toggle("settings-open", settingsOpen);
  settingsToggle.setAttribute("aria-expanded", String(settingsOpen));
  settingsToggle.setAttribute("aria-label", t(settingsOpen ? "closeSettings" : "openSettings"));
  window.eyeProtect.setSettingsOpen(settingsOpen);
}

function applyTranslations() {
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
}

function populateSettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const field = settingsForm?.elements.namedItem(key);
    if (!field) continue;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  }
  toggleIdleThreshold();
}

function toggleIdleThreshold() {
  if (!settingsForm) return;
  idleMinutesRow.hidden = !settingsForm.elements.treatIdleAsBreak.checked;
}

settingsForm?.elements.treatIdleAsBreak.addEventListener("change", toggleIdleThreshold);
settingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(settingsForm);
  const settings = Object.fromEntries(formData.entries());
  for (const key of ["workMinutes", "shortBreakMinutes", "longBreakMinutes", "longBreakEvery", "snoozeMinutes", "idleBreakMinutes"]) {
    settings[key] = Number(settings[key]);
  }
  settings.launchAtLogin = settingsForm.elements.launchAtLogin.checked;
  settings.showOnFullscreen = settingsForm.elements.showOnFullscreen.checked;
  settings.treatIdleAsBreak = settingsForm.elements.treatIdleAsBreak.checked;
  settings.soundEnabled = false;
  const saved = await window.eyeProtect.updateSettings(settings);
  currentLanguage = saved.language;
  populateSettings(saved);
  applyTranslations();
  saveMessage.textContent = t("settingsSaved");
  setTimeout(() => { saveMessage.textContent = ""; }, 3_000);
});

document.querySelector("#hide-reminder")?.addEventListener("click", () => window.eyeProtect.hideReminder());
document.querySelector("#finish-break-strip")?.addEventListener("click", () => window.eyeProtect.command("finish-break"));
settingsToggle?.addEventListener("click", () => setSettingsState(!settingsOpen));

Promise.all([window.eyeProtect.getState(), window.eyeProtect.getSettings()]).then(([state, settings]) => {
  currentLanguage = settings.language;
  populateSettings(settings);
  renderState(state);
});

window.eyeProtect.onStateChanged(renderState);
