const test = require("node:test");
const assert = require("node:assert/strict");
const { TimerEngine, normalizeSettings } = require("../src/core/timer-engine");

function fastSettings(overrides = {}) {
  return {
    workMinutes: 1,
    shortBreakMinutes: 1,
    longBreakMinutes: 3,
    longBreakEvery: 4,
    snoozeMinutes: 1,
    ...overrides,
  };
}

test("uses privacy-friendly, gentle defaults", () => {
  const settings = normalizeSettings();
  assert.equal(settings.workMinutes, 30);
  assert.equal(settings.shortBreakMinutes, 3);
  assert.equal(settings.longBreakMinutes, 15);
  assert.equal(settings.language, "en");
  assert.equal(settings.treatIdleAsBreak, false);
});

test("moves from a work session to a due break", () => {
  const engine = new TimerEngine(fastSettings());
  engine.startWork();
  engine.tick(60);
  assert.equal(engine.snapshot().status, "break_due");
  assert.equal(engine.snapshot().pendingBreakType, "short");
  assert.equal(engine.snapshot().completedWorkSessions, 1);
});

test("requires an explicit start after a completed break", () => {
  const engine = new TimerEngine(fastSettings());
  engine.startWork();
  engine.tick(60);
  engine.startBreak();
  engine.tick(60);
  assert.equal(engine.snapshot().status, "break_complete");
  assert.equal(engine.snapshot().completedBreaks, 1);
  engine.tick(60);
  assert.equal(engine.snapshot().status, "break_complete");
  engine.startWork();
  assert.equal(engine.snapshot().status, "working");
});

test("snoozes without resetting the work session", () => {
  const engine = new TimerEngine(fastSettings());
  engine.startWork();
  engine.tick(60);
  engine.snooze();
  assert.equal(engine.snapshot().status, "snoozed");
  engine.tick(60);
  assert.equal(engine.snapshot().status, "break_due");
  assert.equal(engine.snapshot().completedWorkSessions, 1);
});

test("skipping begins a fresh work session and records the choice", () => {
  const engine = new TimerEngine(fastSettings());
  engine.startWork();
  engine.tick(60);
  engine.skipBreak();
  const state = engine.snapshot();
  assert.equal(state.status, "working");
  assert.equal(state.remainingSeconds, 60);
  assert.equal(state.skippedBreaks, 1);
});

test("offers a long break every configured number of sessions", () => {
  const engine = new TimerEngine(fastSettings({ longBreakEvery: 2 }));
  engine.startWork();
  engine.tick(60);
  engine.startBreak();
  engine.tick(60);
  engine.startWork();
  engine.tick(60);
  assert.equal(engine.snapshot().pendingBreakType, "long");
  engine.startBreak();
  assert.equal(engine.snapshot().remainingSeconds, 180);
});

test("pauses and resumes without consuming time", () => {
  const engine = new TimerEngine(fastSettings());
  engine.startWork();
  engine.tick(10);
  engine.pause("user");
  engine.tick(30);
  assert.equal(engine.snapshot().remainingSeconds, 50);
  engine.resume();
  assert.equal(engine.snapshot().status, "working");
  assert.equal(engine.snapshot().remainingSeconds, 50);
});

test("a natural break returns to ready", () => {
  const engine = new TimerEngine(fastSettings());
  engine.startWork();
  engine.tick(10);
  engine.pause("system");
  engine.registerNaturalBreak(60);
  assert.equal(engine.snapshot().status, "ready");
  assert.equal(engine.snapshot().completedBreaks, 1);
});

test("idle time while already ready does not inflate break statistics", () => {
  const engine = new TimerEngine(fastSettings());
  engine.registerNaturalBreak(300);
  assert.equal(engine.snapshot().status, "ready");
  assert.equal(engine.snapshot().completedBreaks, 0);
});
