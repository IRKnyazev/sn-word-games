/** Mutable probe state kept in memory for the plugin's lifetime. */
import type {Point, Rect} from '../layout/geometry';

export interface PenUpSample {
  at: number;
  type: number;
  penType?: number;
  numInPage?: number;
  maxX?: number;
  maxY?: number;
  nPoints: number;
  bounds: Rect | null;
  first?: Point;
  last?: Point;
}

export interface MotionSample {
  at: number;
  action: number;
  toolType: number;
  x: number;
  y: number;
  pointerCount: number;
}

export type Armable = 'p2' | 'p4';

/** How long "Arm" lasts. Checked with Date.now(), never with timers. */
export const ARM_MS = 10 * 60 * 1000;
/** A run that started longer ago than this no longer blocks new runs. */
export const BUSY_STALE_MS = 3 * 60 * 1000;
/** Minimum gap between two page-button actions. */
export const TAP_DEBOUNCE_MS = 2000;

function pushRing<T>(list: T[], item: T, max: number): void {
  list.push(item);
  if (list.length > max) {
    list.splice(0, list.length - max);
  }
}

export class ProbeState {
  private armedUntil: Record<Armable, number> = {p2: 0, p4: 0};
  readonly penUps: PenUpSample[] = [];
  readonly motions: MotionSample[] = [];
  busy: {name: string; since: number; token: number} | null = null;
  /** When a page-button tap started being handled (0 = none in flight). */
  tapSince = 0;
  private nextToken = 1;
  lastFireAt = 0;

  arm(kind: Armable, now: number): void {
    this.armedUntil[kind] = now + ARM_MS;
  }

  disarm(kind: Armable): void {
    this.armedUntil[kind] = 0;
  }

  isArmed(kind: Armable, now: number): boolean {
    return now < this.armedUntil[kind];
  }

  minutesLeft(kind: Armable, now: number): number {
    return Math.max(0, Math.ceil((this.armedUntil[kind] - now) / 60000));
  }

  addPenUp(s: PenUpSample): void {
    pushRing(this.penUps, s, 20);
  }

  addMotion(s: MotionSample): void {
    pushRing(this.motions, s, 40);
  }

  /** Claims the busy flag; null if another run holds a fresh claim. */
  tryBegin(name: string, now: number): number | null {
    if (this.isBusy(now)) {
      return null;
    }
    const token = this.nextToken++;
    this.busy = {name, since: now, token};
    return token;
  }

  isBusy(now: number): boolean {
    return this.busy !== null && now - this.busy.since < BUSY_STALE_MS;
  }

  /** Long runs call this between steps so they don't look stale. */
  heartbeat(now: number): void {
    if (this.busy) {
      this.busy.since = now;
    }
  }

  /** Releases the claim only if it is still ours. */
  end(token: number): void {
    if (this.busy?.token === token) {
      this.busy = null;
    }
  }

  /** Claims tap handling; false if a fresh tap is still being handled. */
  tryBeginTap(now: number): boolean {
    if (this.tapSince !== 0 && now - this.tapSince < BUSY_STALE_MS) {
      return false;
    }
    this.tapSince = now;
    return true;
  }

  endTap(): void {
    this.tapSince = 0;
  }
}
