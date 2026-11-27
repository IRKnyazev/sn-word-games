/**
 * Page-button tap detection from raw motion events (pure). A tap is a down
 * and an up inside the same zone that moved ≤ 50 px (Ink2Task's rule).
 */
import {contains, type Point} from '../layout/geometry';
import type {Zone} from '../layout/types';

export interface MotionLike {
  action: number;
  x: number;
  y: number;
  toolType?: number;
  pointerCount?: number;
}

export interface Tap {
  zone: Zone;
  tool: 'finger' | 'pen' | 'unknown';
  at: Point;
  moved: number;
}

export const ACTION = {down: 0, up: 1, move: 2, cancel: 3} as const;
export const MAX_TAP_MOVE = 50;

export function toolName(toolType: number | undefined): Tap['tool'] {
  return toolType === 1 ? 'finger' : toolType === 2 ? 'pen' : 'unknown';
}

export class TapDetector {
  private start: {zone: Zone; at: Point} | null = null;

  constructor(private zones: Zone[]) {}

  setZones(zones: Zone[]): void {
    this.zones = zones;
    this.start = null;
  }

  zoneAt(p: Point): Zone | undefined {
    return this.zones.find(z => contains(z.rect, p));
  }

  /** Feed every down/up/cancel; returns a Tap when one completes. */
  feed(ev: MotionLike): Tap | null {
    if ((ev.pointerCount ?? 1) > 1 || ev.action === ACTION.cancel) {
      this.start = null;
      return null;
    }
    const p = {x: ev.x, y: ev.y};
    if (ev.action === ACTION.down) {
      const zone = this.zoneAt(p);
      this.start = zone ? {zone, at: p} : null;
      return null;
    }
    if (ev.action !== ACTION.up || !this.start) {
      return null;
    }
    const {zone, at} = this.start;
    this.start = null;
    const moved = Math.hypot(p.x - at.x, p.y - at.y);
    if (!contains(zone.rect, p) || moved > MAX_TAP_MOVE) {
      return null;
    }
    return {zone, tool: toolName(ev.toolType), at: p, moved};
  }
}
