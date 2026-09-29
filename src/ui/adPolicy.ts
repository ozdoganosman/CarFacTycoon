// When a full-screen advertisement may appear, in real minutes (the game's weeks fly past at top
// speed): never in the first minutes of a session, never soon after another one, and at most once
// per natural break (a launch show over, a newspaper put down, a year closed).

export const AD_POLICY = {
  /** No advertisement the player did not ask for in the first minutes of a session. */
  warmup: 3 * 60_000,
  /** Between two full-screen advertisements of any kind. */
  gap: 4 * 60_000,
  /** Between two year-end offers that start by themselves. */
  yearOfferGap: 6 * 60_000,
  /** Seconds the year-end offer waits before its advertisement starts (the player can say no). */
  countdown: 5,
};

export class AdClock {
  private lastFull = -Infinity;
  private lastYearOffer = -Infinity;
  constructor(private readonly start: number) {}

  private warm(now: number) {
    return now - this.start >= AD_POLICY.warmup;
  }

  /** A full-screen advertisement at a natural break. */
  canInterstitial(now: number) {
    return this.warm(now) && now - this.lastFull >= AD_POLICY.gap;
  }

  /** A year-end offer that counts down and starts by itself (otherwise it waits for a tap). */
  canAutoYearOffer(now: number) {
    return this.warm(now) && now - this.lastYearOffer >= AD_POLICY.yearOfferGap && now - this.lastFull >= AD_POLICY.gap / 2;
  }

  /** Any full-screen advertisement was shown, asked for or not. */
  shown(now: number) {
    this.lastFull = now;
  }

  yearOffered(now: number) {
    this.lastYearOffer = now;
  }
}
