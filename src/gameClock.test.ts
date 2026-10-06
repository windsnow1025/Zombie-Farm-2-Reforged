import { afterEach, describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";
import { fastForwardGameClock, gameClockLeadMs, gameNow, restoreGameClockLead } from "./gameClock";
import { Field, PLOT } from "./Field";
import { POT_DURATION_MS, ZombiePot } from "./zombie/ZombiePot";
import { periodIndex } from "./quest/periodic/periods";

// The farm's clock is the device clock plus the Fast Forward lead. The timers below
// are the ones a player waits on; each stores an absolute epoch and reads it against
// gameNow(), which is what lets one lead move all of them at once.

afterEach(() => {
  restoreGameClockLead(undefined);
  vi.useRealTimers();
});

describe("game clock", () => {
  it("is the device clock until Fast Forward is used", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    expect(gameClockLeadMs()).toBe(0);
    expect(gameNow()).toBe(1_700_000_000_000);
  });

  it("runs ahead by every span fast-forwarded, and keeps ticking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    fastForwardGameClock(60_000);
    fastForwardGameClock(3_600_000);
    expect(gameClockLeadMs()).toBe(3_660_000);
    expect(gameNow()).toBe(1_700_000_000_000 + 3_660_000);
    vi.setSystemTime(1_700_000_005_000);
    expect(gameNow()).toBe(1_700_000_005_000 + 3_660_000);
  });

  it("refuses a span that would not move the clock forward", () => {
    expect(() => fastForwardGameClock(0)).toThrow();
    expect(() => fastForwardGameClock(-1)).toThrow();
    expect(() => fastForwardGameClock(Number.NaN)).toThrow();
    expect(() => fastForwardGameClock(Number.POSITIVE_INFINITY)).toThrow();
    expect(gameClockLeadMs()).toBe(0);
  });

  it("restores a saved lead, and reads a missing or damaged one as none", () => {
    restoreGameClockLead(90_000.9);
    expect(gameClockLeadMs()).toBe(90_000);
    restoreGameClockLead(undefined);
    expect(gameClockLeadMs()).toBe(0);
    restoreGameClockLead(-5);
    expect(gameClockLeadMs()).toBe(0);
    restoreGameClockLead(Number.NaN);
    expect(gameClockLeadMs()).toBe(0);
  });

  it("adopts a save's lead in place of the live one", () => {
    fastForwardGameClock(1000);
    restoreGameClockLead(500);
    expect(gameClockLeadMs()).toBe(500);
  });
});

/** A Field without its Pixi constructor, the way Field.movePlot.test.ts builds one.
 *  update() walks the plots, the particle field, the objects and the two sorted layers. */
const makeField = () => {
  const field: Field = Object.create(Field.prototype);
  Object.assign(field, {
    plots: new Map(),
    tilePlot: new Map<string, string>(),
    objects: new Map(),
    entityLayer: new Container(),
    groundObjectLayer: new Container(),
    fx: { update: () => {} },
    layoutCrop: vi.fn().mockReturnValue(0),
  });
  return field;
};

/** Register a planted plot the way plantAt would, minus the sprite work. */
const plantCrop = (field: Field, oc: number, or: number, growMs: number) => {
  const key = `${oc},${or}`;
  const cfg = { name: "Carrot", growMs, stages: ["seed.png", "sprout.png", "ripe.png"] };
  const crop = { cfg, plantedAt: gameNow(), ageMs: 0, sprite: {}, baseY: 0 };
  (field as any).plots.set(key, { oc, or, soil: {}, state: "planted", crop });
  for (let r = or; r < or + PLOT; r++)
    for (let c = oc; c < oc + PLOT; c++) (field as any).tilePlot.set(`${c},${r}`, key);
};

describe("timers read against the game clock", () => {
  it("a crop planted now is ripe once its grow time is fast-forwarded", () => {
    const field = makeField();
    const growMs = 30 * 60_000;
    plantCrop(field, 0, 0, growMs);
    field.update(0);
    expect(field.isRipe(0, 0)).toBe(false);
    expect(field.cropInfoAt(0, 0)?.remainingMs).toBeGreaterThan(growMs - 1000);

    fastForwardGameClock(growMs);
    field.update(0);
    expect(field.isRipe(0, 0)).toBe(true);
    expect(field.cropInfoAt(0, 0)?.remainingMs).toBe(0);
  });

  it("a Zombie Pot combine finishes when its hour is fast-forwarded", () => {
    const pot = new ZombiePot(undefined, () => 0);
    expect(pot.start({ key: "A", mutation: 0 }, { key: "B", mutation: 0 }, false)).toBe(true);
    expect(pot.ready).toBe(false);
    fastForwardGameClock(POT_DURATION_MS);
    expect(pot.ready).toBe(true);
    expect(pot.remainingMs()).toBe(0);
  });

  it("a day's fast-forward rolls the daily quest period over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 0, 1, 12));
    const today = periodIndex("daily", gameNow());
    fastForwardGameClock(24 * 60 * 60_000);
    expect(periodIndex("daily", gameNow())).toBe(today + 1);
  });
});
