/**
 * A small 2D top-down occupancy grid built incrementally from depth columns +
 * compass heading. Cells are FREE / OCCUPIED / UNKNOWN. Provides a greedy
 * "safest forward step" toward a target bearing, avoiding occupied cells.
 * This is deliberately lightweight — enough for room-scale guidance, not SLAM.
 */
export type Cell = 0 | 1 | 2; // 0 unknown, 1 free, 2 occupied

export class OccupancyGrid {
  readonly size: number;
  readonly cellM: number;
  private cells: Cell[];
  /** User is at the grid centre, facing +Y (up). */
  constructor(size = 41, cellM = 0.25) {
    this.size = size % 2 === 0 ? size + 1 : size;
    this.cellM = cellM;
    this.cells = new Array(this.size * this.size).fill(0);
  }

  private idx(cx: number, cy: number): number {
    return cy * this.size + cx;
  }

  get center(): number {
    return Math.floor(this.size / 2);
  }

  /**
   * Integrate one depth reading: at relative bearing (radians from forward)
   * an obstacle sits `distanceM` away; everything nearer along that ray is free.
   */
  integrate(bearingRad: number, distanceM: number): void {
    const c = this.center;
    const steps = Math.floor(distanceM / this.cellM);
    const dx = Math.sin(bearingRad);
    const dy = Math.cos(bearingRad);
    for (let s = 0; s < steps; s++) {
      const gx = Math.round(c + dx * s);
      const gy = Math.round(c + dy * s);
      if (this.inBounds(gx, gy)) this.cells[this.idx(gx, gy)] = 1;
    }
    const ox = Math.round(c + dx * steps);
    const oy = Math.round(c + dy * steps);
    if (this.inBounds(ox, oy)) this.cells[this.idx(ox, oy)] = 2;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.size && cy < this.size;
  }

  isOccupied(cx: number, cy: number): boolean {
    return this.cells[this.idx(cx, cy)] === 2;
  }

  /**
   * Pick the next heading (radians, relative to forward) toward `targetBearing`
   * that is not blocked in the next `lookAhead` metres. Returns null if all
   * forward-ish directions are blocked (caller says "path blocked, turn around").
   */
  nextHeading(targetBearing: number, lookAhead = 1.0): number | null {
    const offsets = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05];
    // Prefer headings closest to the target bearing.
    offsets.sort(
      (a, b) => Math.abs(a - targetBearing) - Math.abs(b - targetBearing)
    );
    for (const off of offsets) {
      if (this.isClear(targetBearing + off, lookAhead)) return targetBearing + off;
    }
    return null;
  }

  private isClear(bearingRad: number, lookAhead: number): boolean {
    const c = this.center;
    const steps = Math.floor(lookAhead / this.cellM);
    const dx = Math.sin(bearingRad);
    const dy = Math.cos(bearingRad);
    for (let s = 1; s <= steps; s++) {
      const gx = Math.round(c + dx * s);
      const gy = Math.round(c + dy * s);
      if (!this.inBounds(gx, gy)) return false;
      if (this.cells[this.idx(gx, gy)] === 2) return false;
    }
    return true;
  }

  reset(): void {
    this.cells.fill(0);
  }
}

/** Turn a relative bearing (radians) into a spoken instruction. */
export function bearingToInstruction(bearingRad: number): string {
  const deg = (bearingRad * 180) / Math.PI;
  if (Math.abs(deg) < 10) return 'Walk forward';
  if (deg >= 10 && deg < 40) return 'Turn slightly right';
  if (deg >= 40) return 'Turn right';
  if (deg <= -10 && deg > -40) return 'Turn slightly left';
  return 'Turn left';
}
