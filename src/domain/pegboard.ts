// IKEA SKÅDIS pegboard hole layout, in metres.
// The holes keep these real dimensions regardless of the board's size: a larger
// board gains more slots rather than larger ones.
export const PEGBOARD = {
  holeWidth: 0.005,
  holeHeight: 0.015,
  pitch: 0.04,
  margin: 0.02,
  thickness: 0.005,
  cornerRadius: 0.008,
  maxHoles: 6000,
} as const;

const EPS = 1e-9;

// One row (or column) of holes on a 40 mm pitch, starting `offset` from the edge.
function rail(span: number, offset: number): number[] {
  const { margin, pitch } = PEGBOARD;
  const values: number[] = [];
  for (let v = margin + offset; v <= span - margin + EPS; v += pitch) values.push(v);
  return values;
}

// Slide the whole pattern by up to one half pitch so the leftover space is split
// evenly between both edges, while every hole stays at least `margin` from them.
function centringShift(span: number, groups: number[][]): number {
  let min = Infinity,
    max = -Infinity;
  for (const group of groups)
    for (const v of group) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  if (min === Infinity) return 0;
  const room = span - PEGBOARD.margin - max; // any further would break the margin
  return Math.max(0, Math.min((span - max - min) / 2, room));
}

/**
 * Hole centres in metres: x is measured from the board's centre line, y from its
 * bottom edge. The two 40 mm grids from the SKÅDIS drawing — (40m, 40n) and
 * (40m + 20, 40n + 20) — interleave, so diagonal neighbours sit ≈28.28 mm apart.
 * Hole size, pitch and the 20 mm edge margin are physical dimensions and never
 * depend on how large the board is; resizing only changes how many holes fit.
 */
export function pegboardHoles(width: number, boardHeight: number): [number, number][] {
  const { margin, pitch, maxHoles } = PEGBOARD;
  if (width < margin * 2 || boardHeight < margin * 2) return [];
  const columns = [rail(width, 0), rail(width, pitch / 2)];
  const rows = [rail(boardHeight, 0), rail(boardHeight, pitch / 2)];
  if (!columns[0].length || !rows[0].length) return [];
  const dx = centringShift(width, columns),
    dy = centringShift(boardHeight, rows);
  const points: [number, number][] = [];
  for (let g = 0; g < 2; g++) {
    for (const y of rows[g]) {
      for (const x of columns[g]) {
        if (points.length >= maxHoles) return points;
        points.push([x + dx - width / 2, y + dy]);
      }
    }
  }
  return points;
}
