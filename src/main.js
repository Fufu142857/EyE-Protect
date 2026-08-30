const path = require("node:path");
const fs = require("node:fs/promises");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  Tray,
} = require("electron");
const { TimerEngine } = require("./core/timer-engine");
const { SettingsStore } = require("./settings-store");

const APP_NAME = "EyE-Protect";
const TICK_MS = 1_000;
const MAIN_COMPACT_SIZE = Object.freeze({ width: 450, height: 255 });
const MAIN_EXPANDED_SIZE = Object.freeze({ width: 700, height: 620 });
const REMINDER_SIZES = Object.freeze({
  break_due: { width: 380, height: 220 },
  breaking: { width: 520, height: 96 },
  break_complete: { width: 360, height: 190 },
});

let engine;
let settingsStore;
let mainWindow;
let reminderWindow;
let tray;
let lastStatus;
let systemPauseStartedAt = null;
let systemPauseOwnsTimer = false;
let idlePauseStartedAt = null;
let idlePauseOwnsTimer = false;
let resizeAnimation = null;

function createTrayIcon() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "assets", "tray-icon.png"))
    .resize({ width: 16, height: 16 });
  if (process.platform === "darwin") icon.setTemplateImage(true);
  return icon;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    ...MAIN_COMPACT_SIZE,
    minWidth: MAIN_COMPACT_SIZE.width,
    minHeight: MAIN_COMPACT_SIZE.height,
    resizable: false,
    useContentSize: true,
    title: APP_NAME,
    backgroundColor: "#f2f0e9",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createReminderWindow() {
  if (reminderWindow && !reminderWindow.isDestroyed()) return reminderWindow;

  reminderWindow = new BrowserWindow({
    width: REMINDER_SIZES.break_due.width,
    height: REMINDER_SIZES.break_due.height,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  reminderWindow.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: { mode: "reminder" },
  });
  reminderWindow.on("closed", () => {
    reminderWindow = null;
  });
  return reminderWindow;
}

function positionReminder(state = engine.snapshot()) {
  const window = createReminderWindow();
  const size = REMINDER_SIZES[state.status] || REMINDER_SIZES.break_due;
  window.setSize(size.width, size.height, false);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const [windowWidth, windowHeight] = window.getSize();
  window.setPosition(x + width - windowWidth - 18, y + height - windowHeight - 18, false);
}

function showReminder(state = engine.snapshot()) {
  const window = createReminderWindow();
  positionReminder(state);
  if (typeof window.showInactive === "function") window.showInactive();
  else window.show();
}

function hideReminder() {
  if (reminderWindow && !reminderWindow.isDestroyed()) reminderWindow.hide();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function animateMainWindow(open) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (resizeAnimation) clearInterval(resizeAnimation);

  const target = open ? MAIN_EXPANDED_SIZE : MAIN_COMPACT_SIZE;
  const start = mainWindow.getBounds();
  const display = screen.getDisplayMatching(start);
  const centreX = start.x + start.width / 2;
  const centreY = start.y + start.height / 2;
  const targetX = Math.round(Math.min(
    display.workArea.x + display.workArea.width - target.width,
    Math.max(display.workArea.x, centreX - target.width / 2),
  ));
  const targetY = Math.round(Math.min(
    display.workArea.y + display.workArea.height - target.height,
    Math.max(display.workArea.y, centreY - target.height / 2),
  ));
  const targetBounds = { x: targetX, y: targetY, ...target };
  const frames = 12;
  let frame = 0;

  if (open) mainWindow.setResizable(true);
  resizeAnimation = setInterval(() => {
    frame += 1;
    const progress = frame / frames;
    const eased = 1 - ((1 - progress) ** 3);
    const next = {};
    for (const key of ["x", "y", "width", "height"]) {
      next[key] = Math.round(start[key] + (targetBounds[key] - start[key]) * eased);
    }
    mainWindow.setBounds(next, false);
    if (frame >= frames) {
      clearInterval(resizeAnimation);
      resizeAnimation = null;
      if (!open) mainWindow.setResizable(false);
    }
  }, 16);
}

function formatRemaining(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function stateLabel(state) {
  const labels = {
    ready: "Ready",
    working: `Working · ${formatRemaining(state.remainingSeconds)}`,
    break_due: state.pendingBreakType === "long" ? "Long break due" : "Break due",
    snoozed: `Reminder snoozed · ${formatRemaining(state.remainingSeconds)}`,
    breaking: `${state.pendingBreakType === "long" ? "Long break" : "Eye break"} · ${formatRemaining(state.remainingSeconds)}`,
    break_complete: "Break complete",
    paused: "Paused",
  };
  return labels[state.status] || APP_NAME;
}

function rebuildTrayMenu(state) {
  if (!tray) return;
  const menu = [
    { label: stateLabel(state), enabled: false },
    { type: "separator" },
  ];

  if (new Set(["ready", "break_complete"]).has(state.status)) {
    menu.push({ label: "Start session", click: () => engine.startWork() });
  }
  if (new Set(["break_due", "snoozed"]).has(state.status)) {
    menu.push({ label: "Start break", click: () => engine.startBreak() });
  }
  if (new Set(["working", "snoozed", "breaking"]).has(state.status)) {
    menu.push({ label: "Pause", click: () => engine.pause("user") });
  }
  if (state.status === "paused") {
    menu.push({ label: "Resume", click: () => engine.resume() });
  }

  menu.push(
    { type: "separator" },
    { label: "Open EyE-Protect", click: showMainWindow },
    { label: "Quit", click: () => app.quit() },
  );

  tray.setContextMenu(Menu.buildFromTemplate(menu));
}

function broadcastState(state) {
  for (const window of [mainWindow, reminderWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send("timer:state", state);
  }
}

function handleEngineChange(state) {
  broadcastState(state);
  tray?.setToolTip(`${APP_NAME} — ${stateLabel(state)}`);

  if (state.status !== lastStatus) {
    rebuildTrayMenu(state);
    if (new Set(["break_due", "breaking", "break_complete"]).has(state.status)) {
      showReminder(state);
    } else {
      hideReminder();
    }
    lastStatus = state.status;
  }
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(APP_NAME);
  tray.on("click", showMainWindow);
  rebuildTrayMenu(engine.snapshot());
}

function applyLoginSetting(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: true,
  });
}

function startSystemAwareness() {
  const beginSystemPause = () => {
    if (systemPauseStartedAt !== null) return;
    systemPauseStartedAt = Date.now();
    systemPauseOwnsTimer = engine.pause("system");
  };

  const endSystemPause = () => {
    if (systemPauseStartedAt === null) return;
    const durationSeconds = Math.floor((Date.now() - systemPauseStartedAt) / 1_000);
    systemPauseStartedAt = null;
    if (durationSeconds >= engine.settings.shortBreakMinutes * 60) {
      engine.registerNaturalBreak(durationSeconds);
    } else if (systemPauseOwnsTimer) {
      engine.resume();
    }
    systemPauseOwnsTimer = false;
  };

  powerMonitor.on("lock-screen", beginSystemPause);
  powerMonitor.on("suspend", beginSystemPause);
  powerMonitor.on("unlock-screen", endSystemPause);
  powerMonitor.on("resume", endSystemPause);

  setInterval(() => {
    if (!engine.settings.treatIdleAsBreak || systemPauseStartedAt !== null) {
      idlePauseStartedAt = null;
      idlePauseOwnsTimer = false;
      return;
    }

    const idleSeconds = powerMonitor.getSystemIdleTime();
    const thresholdSeconds = engine.settings.idleBreakMinutes * 60;
    if (idleSeconds >= thresholdSeconds && idlePauseStartedAt === null) {
      if (engine.status === "paused" && engine.pauseReason === "user") return;
      idlePauseStartedAt = Date.now() - idleSeconds * 1_000;
      idlePauseOwnsTimer = engine.pause("idle");
    } else if (idleSeconds < thresholdSeconds && idlePauseStartedAt !== null) {
      const durationSeconds = Math.floor((Date.now() - idlePauseStartedAt) / 1_000);
      idlePauseStartedAt = null;
      engine.registerNaturalBreak(durationSeconds);
      idlePauseOwnsTimer = false;
    }
  }, 5_000);
}

function waitForPage(window) {
  if (!window.webContents.isLoadingMainFrame()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.webContents.once("did-finish-load", resolve);
    window.webContents.once("did-fail-load", (_event, code, description) => {
      reject(new Error(`Page load failed (${code}): ${description}`));
    });
  });
}

async function runSmokeTest() {
  const reminder = createReminderWindow();
  await Promise.all([waitForPage(mainWindow), waitForPage(reminder)]);

  const [mainResult, reminderResult] = await Promise.all([
    mainWindow.webContents.executeJavaScript(`({
      title: document.title,
      heading: document.querySelector('#status-title')?.textContent,
      hasApi: typeof window.eyeProtect?.getState === 'function'
    })`),
    reminder.webContents.executeJavaScript(`({
      title: document.title,
      reminderMode: document.body.classList.contains('reminder'),
      hasActions: Boolean(document.querySelector('#actions')),
      hasBreakStrip: Boolean(document.querySelector('.break-strip'))
    })`),
  ]);

  let passed =
    mainResult.title === APP_NAME &&
    mainResult.hasApi &&
    reminderResult.title === APP_NAME &&
    reminderResult.reminderMode &&
    reminderResult.hasActions &&
    reminderResult.hasBreakStrip &&
    !createTrayIcon().isEmpty();

  let captures;
  if (process.argv.includes("--capture-smoke")) {
    const captureDirectory = path.join(app.getPath("temp"), "eye-protect-smoke");
    const compactPath = path.join(captureDirectory, "compact.png");
    const settingsPath = path.join(captureDirectory, "settings.png");
    const reminderPath = path.join(captureDirectory, "reminder.png");
    const breakPath = path.join(captureDirectory, "break-strip.png");
    await fs.mkdir(captureDirectory, { recursive: true });

    mainWindow.show();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const compactImage = await mainWindow.webContents.capturePage();
    await mainWindow.webContents.executeJavaScript("document.querySelector('#settings-toggle').click()");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const settingsImage = await mainWindow.webContents.capturePage();
    await mainWindow.webContents.executeJavaScript("document.querySelector('#settings-toggle').click()");
    await new Promise((resolve) => setTimeout(resolve, 350));

    engine.startWork();
    engine.tick(engine.settings.workMinutes * 60);
    reminder.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const reminderImage = await reminder.webContents.capturePage();
    engine.startBreak();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const breakImage = await reminder.webContents.capturePage();

    await Promise.all([
      fs.writeFile(compactPath, compactImage.toPNG()),
      fs.writeFile(settingsPath, settingsImage.toPNG()),
      fs.writeFile(reminderPath, reminderImage.toPNG()),
      fs.writeFile(breakPath, breakImage.toPNG()),
    ]);
    captures = { compact: compactPath, settings: settingsPath, reminder: reminderPath, break: breakPath };
  }

  if (engine.status === "breaking") engine.finishBreakEarly();
  mainWindow.show();
  await mainWindow.webContents.executeJavaScript("window.eyeProtect.command('start-work')");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mainHidesOnStart = !mainWindow.isVisible();
  passed = passed && mainHidesOnStart;

  console.log(JSON.stringify({ passed, mainHidesOnStart, main: mainResult, reminder: reminderResult, captures }));
  if (!passed) app.exit(1);
  else app.quit();
}

function registerIpc() {
  ipcMain.handle("timer:get-state", () => engine.snapshot());
  ipcMain.handle("settings:get", () => settingsStore.get());
  ipcMain.handle("settings:update", (_event, settings) => {
    const saved = settingsStore.update(settings);
    engine.updateSettings(saved);
    applyLoginSetting(saved.launchAtLogin);
    return saved;
  });
  ipcMain.handle("window:show-main", () => showMainWindow());
  ipcMain.handle("window:hide-reminder", () => hideReminder());
  ipcMain.handle("window:set-settings-open", (_event, open) => {
    animateMainWindow(Boolean(open));
    return true;
  });
  ipcMain.handle("timer:command", (_event, command) => {
    const commands = {
      "start-work": () => engine.startWork(),
      "start-break": () => engine.startBreak(),
      snooze: () => engine.snooze(),
      skip: () => engine.skipBreak(),
      pause: () => engine.pause("user"),
      resume: () => engine.resume(),
      "finish-break": () => engine.finishBreakEarly(),
    };
    if (!Object.hasOwn(commands, command)) return false;
    const result = commands[command]();
    if (result && command === "start-work" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    return { ok: Boolean(result), state: engine.snapshot() };
  });
}

const isSmokeTest = process.argv.includes("--smoke-test");
const hasSingleInstanceLock = isSmokeTest || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(() => {
    app.setName(APP_NAME);
    settingsStore = new SettingsStore(app.getPath("userData"));
    engine = new TimerEngine(settingsStore.get());
    engine.on("change", handleEngineChange);

    createTray();
    createMainWindow();
    registerIpc();
    startSystemAwareness();
    if (engine.settings.launchAtLogin) applyLoginSetting(true);

    setInterval(() => engine.tick(), TICK_MS);

    app.on("activate", showMainWindow);

    if (isSmokeTest) {
      runSmokeTest().catch((error) => {
        console.error(error);
        app.exit(1);
      });
    }
  });
}

app.on("window-all-closed", () => {});
