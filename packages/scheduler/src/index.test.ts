import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  packSchedule,
  freeSlots,
  DEFAULT_PREFS,
  type SchedulableTask,
  type BusyBlock,
} from "./index.js";

describe("freeSlots", () => {
  it("excludes busy blocks within work hours", () => {
    // Monday 2026-07-27
    const from = new Date(2026, 6, 27, 9, 0);
    const to = new Date(2026, 6, 27, 17, 0);
    const busy: BusyBlock[] = [
      { start: new Date(2026, 6, 27, 10, 0), end: new Date(2026, 6, 27, 11, 0) },
    ];
    const slots = freeSlots(from, to, busy, DEFAULT_PREFS);
    assert.ok(slots.length >= 2);
    assert.ok(slots.every((s) => s.end > s.start));
  });
});

describe("packSchedule", () => {
  it("places higher priority tasks first", () => {
    const now = new Date(2026, 6, 27, 9, 0);
    const tasks: SchedulableTask[] = [
      {
        id: "low",
        priority: 1,
        estimateMinutes: 60,
        dueAt: null,
        locked: false,
        createdAt: now,
      },
      {
        id: "high",
        priority: 5,
        estimateMinutes: 60,
        dueAt: null,
        locked: false,
        createdAt: now,
      },
    ];
    const result = packSchedule(tasks, [], now, DEFAULT_PREFS);
    const high = result.placements.find((p) => p.taskId === "high");
    const low = result.placements.find((p) => p.taskId === "low");
    assert.ok(high && low);
    assert.ok(high.start.getTime() <= low.start.getTime());
  });

  it("leaves a buffer gap after each packed task", () => {
    const now = new Date(2026, 6, 27, 9, 0);
    const tasks: SchedulableTask[] = [
      {
        id: "a",
        priority: 5,
        estimateMinutes: 60,
        dueAt: null,
        locked: false,
        createdAt: now,
      },
      {
        id: "b",
        priority: 4,
        estimateMinutes: 60,
        dueAt: null,
        locked: false,
        createdAt: now,
      },
    ];
    const result = packSchedule(tasks, [], now, { ...DEFAULT_PREFS, bufferMinutes: 15 });
    const a = result.placements.find((p) => p.taskId === "a");
    const b = result.placements.find((p) => p.taskId === "b");
    assert.ok(a && b);
    const gapMs = b.start.getTime() - a.end.getTime();
    assert.ok(gapMs >= 15 * 60_000, `expected >=15m gap, got ${gapMs / 60_000}m`);
  });

  it("marks at-risk when placement is after due date", () => {
    const now = new Date(2026, 6, 27, 9, 0);
    const tasks: SchedulableTask[] = [
      {
        id: "late",
        priority: 3,
        estimateMinutes: 120,
        dueAt: new Date(2026, 6, 27, 10, 0),
        locked: false,
        createdAt: now,
      },
    ];
    // Busy until 11 so task starts after due
    const busy: BusyBlock[] = [
      { start: new Date(2026, 6, 27, 9, 0), end: new Date(2026, 6, 27, 11, 0) },
    ];
    const result = packSchedule(tasks, busy, now, DEFAULT_PREFS);
    const p = result.placements.find((x) => x.taskId === "late");
    assert.ok(p);
    assert.equal(p.atRisk, true);
  });
});
