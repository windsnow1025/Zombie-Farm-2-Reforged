// The clock every farm timer is read against: the device clock plus a LEAD, which is
// how far Fast Forward (Settings → Game, Local Farm only) has moved the farm's time
// ahead. Crops, fruit trees, Zombie Pots, the invasion cooldown, Epic Boss events, the
// daily and weekly quest periods, friend-gift cooldowns and queued farmer jobs all store
// absolute epochs and compare them against gameNow(), so moving the lead is the same as
// the game having been closed for that long, and the offline-growth paths do the rest.
//
// The lead lives in the Local Farm save (SaveGame.clockLeadMs) and is restored before the
// farm is hydrated, because every epoch written after a Fast Forward is in the led clock's
// domain: loaded without it, those epochs would sit in the future and the farm would
// rewind. It only ever grows. Online Farm never sets one (its timers are the server's,
// translated through net/clock.ts), so there gameNow() is Date.now().

let leadMs = 0;

/** Epoch ms on the farm's clock: the device clock plus the Fast Forward lead. */
export function gameNow(): number {
  return Date.now() + leadMs;
}

/** How far the farm's clock runs ahead of the device's. 0 until Fast Forward is used. */
export function gameClockLeadMs(): number {
  return leadMs;
}

/** Adopt a save's lead. Absent on saves written before Fast Forward existed and on every
 *  online save; a damaged value reads as no lead rather than failing the load, as every
 *  other sanitized save field does. */
export function restoreGameClockLead(saved: number | undefined): void {
  const lead = Math.trunc(Number(saved));
  leadMs = Number.isFinite(lead) && lead > 0 ? lead : 0;
}

/** Move the farm's clock ahead by `ms`. Only the clock moves: what the skipped span owes
 *  (queued farmer jobs, crop stages, the boards) is replayed by the caller, see
 *  `onFastForward` in main.ts. */
export function fastForwardGameClock(ms: number): void {
  if (!(Number.isFinite(ms) && ms > 0)) throw new Error(`fast forward needs a positive span, got ${ms}`);
  leadMs += Math.trunc(ms);
}
