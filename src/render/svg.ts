/**
 * Layout → SVG. Pure string building so it runs in Node (template script)
 * and, later, on the device. Lines and boxes are snapped to whole pixels so
 * the rasterised template is crisp on e-ink.
 */
import type {Rect} from '../layout/geometry';
import type {Grey, PageLayout, Shape} from '../layout/types';

export const TEMPLATE_FONT_FAMILY = 'Libre Franklin';

export function greyHex(g: Grey): string {
  const v = Math.max(0, Math.min(255, Math.round(g)));
  const h = v.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Odd stroke widths sit on half pixels to cover whole pixel columns. */
function snap(v: number, strokeWidth: number): number {
  return strokeWidth % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v);
}

function rectSvg(
  r: Rect,
  strokeWidth: number,
  stroke: Grey | undefined,
  fill: Grey | undefined,
): string {
  if (strokeWidth > 0 && stroke !== undefined) {
    // Stroke is drawn inside the rect so neighbouring boxes share edges cleanly.
    const half = strokeWidth / 2;
    const x = snap(r.left + half, strokeWidth);
    const y = snap(r.top + half, strokeWidth);
    const w = r.right - r.left - strokeWidth;
    const h = r.bottom - r.top - strokeWidth;
    const fillAttr = fill === undefined ? 'none' : greyHex(fill);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fillAttr}" stroke="${greyHex(
      stroke,
    )}" stroke-width="${strokeWidth}"/>`;
  }
  return `<rect x="${r.left}" y="${r.top}" width="${
    r.right - r.left
  }" height="${r.bottom - r.top}" fill="${greyHex(fill ?? 0)}"/>`;
}

export function shapeToSvg(shape: Shape): string {
  switch (shape.kind) {
    case 'rect':
      return rectSvg(
        shape.rect,
        shape.strokeWidth ?? 0,
        shape.stroke,
        shape.fill,
      );
    case 'line': {
      const w = shape.width;
      const horizontal = shape.from.y === shape.to.y;
      const vertical = shape.from.x === shape.to.x;
      const x1 = vertical ? snap(shape.from.x, w) : shape.from.x;
      const x2 = vertical ? snap(shape.to.x, w) : shape.to.x;
      const y1 = horizontal ? snap(shape.from.y, w) : shape.from.y;
      const y2 = horizontal ? snap(shape.to.y, w) : shape.to.y;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${greyHex(
        shape.grey ?? 0,
      )}" stroke-width="${w}" stroke-linecap="butt"/>`;
    }
    case 'text':
      return `<text x="${shape.at.x}" y="${shape.at.y}" font-size="${
        shape.size
      }" font-weight="${shape.weight ?? 400}" text-anchor="${
        shape.anchor ?? 'start'
      }" fill="${greyHex(shape.grey ?? 0)}">${escapeXml(shape.text)}</text>`;
  }
}

export function layoutToSvg(layout: PageLayout): string {
  const {width, height} = layout.size;
  const body = layout.shapes.map(shapeToSvg).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" font-family="${TEMPLATE_FONT_FAMILY}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    body,
    '</svg>',
  ].join('\n');
}
