/* Stacking markers that land too close together on a timeline.
 *
 * Milestones were drawn as full-title pills at an absolute x-position. At
 * 15px per day a typical label needs roughly nineteen days of clearance and
 * routinely has two, so adjacent milestones ran their text together into one
 * unreadable smear. Diamonds fix the text problem, but two diamonds a day
 * apart still sit on top of each other — so anything that would collide is
 * pushed onto the next row instead. */

export interface Placeable {
  id: string;
  /** Horizontal position in pixels. */
  left: number;
}

export interface Placed<T> {
  item: T;
  /** Row index; 0 is the topmost. */
  row: number;
}

/**
 * Assigns each marker a row such that no two on the same row are closer than
 * `minGap` pixels.
 *
 * Markers are placed left to right, each taking the topmost row where it
 * clears the last marker already on that row — the standard interval-packing
 * approach, which keeps the common case (nothing overlaps) on a single row.
 */
export function stackMarkers<T extends Placeable>(
  items: T[],
  minGap: number,
  maxRows = 4,
): { placed: Placed<T>[]; rows: number } {
  const sorted = [...items].sort((a, b) => a.left - b.left || a.id.localeCompare(b.id));
  // Rightmost edge occupied on each row so far.
  const rowEnds: number[] = [];
  const placed: Placed<T>[] = [];

  for (const item of sorted) {
    let row = rowEnds.findIndex((end) => item.left - end >= minGap);
    if (row === -1) {
      if (rowEnds.length < maxRows) {
        row = rowEnds.length;
        rowEnds.push(item.left);
      } else {
        // Beyond the cap markers would march off the bottom of the band, so
        // the densest cluster shares a row and overlaps slightly. Better than
        // an unbounded band that pushes the chart off screen.
        row = rowEnds.reduce((best, end, i) => (end < rowEnds[best] ? i : best), 0);
        rowEnds[row] = item.left;
      }
    } else {
      rowEnds[row] = item.left;
    }
    placed.push({ item, row });
  }

  return { placed, rows: Math.max(1, rowEnds.length) };
}
