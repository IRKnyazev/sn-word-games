import {probePages} from '../../src/layout/probe';
import type {PageLayout, Shape} from '../../src/layout/types';
import {
  TEMPLATE_FONT_FAMILY,
  escapeXml,
  greyHex,
  layoutToSvg,
  shapeToSvg,
} from '../../src/render/svg';

/** Attributes of the first element in an SVG fragment, as strings. */
function attrs(svg: string): Record<string, string> {
  const tag = svg.match(/^<[a-z]+\b([^>]*?)\/?>/);
  if (!tag) {
    throw new Error(`not an element: ${svg}`);
  }
  const out: Record<string, string> = {};
  for (const m of tag[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * Minimal well-formedness check: tags nest and close, exactly one root,
 * attribute values are quoted, and every '&' starts a known entity.
 */
function checkWellFormed(xml: string): string[] {
  const problems: string[] = [];
  const stack: string[] = [];
  let roots = 0;
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  for (const m of xml.matchAll(tagRe)) {
    const between = xml.slice(last, m.index);
    if (between.includes('<')) {
      problems.push(`unparsed markup near: ${between.slice(0, 40)}`);
    }
    if (stack.length === 0 && between.trim() !== '') {
      problems.push(`text outside the root: ${between.trim().slice(0, 40)}`);
    }
    last = (m.index ?? 0) + m[0].length;
    const [, closing, name, , selfClosing] = m;
    if (closing) {
      const open = stack.pop();
      if (open !== name) {
        problems.push(`</${name}> closes <${open}>`);
      }
    } else {
      if (stack.length === 0) {
        roots++;
      }
      if (!selfClosing) {
        stack.push(name);
      }
    }
  }
  if (xml.slice(last).trim() !== '') {
    problems.push('trailing content after the root');
  }
  if (stack.length > 0) {
    problems.push(`unclosed: ${stack.join(',')}`);
  }
  if (roots !== 1) {
    problems.push(`${roots} root elements`);
  }
  const badAmp = xml.match(/&(?!(amp|lt|gt|quot|apos);)/g);
  if (badAmp) {
    problems.push(`${badAmp.length} raw '&'`);
  }
  return problems;
}

describe('greyHex', () => {
  it.each([
    [0, '#000000'],
    [255, '#ffffff'],
    [0x80, '#808080'],
    [0x0a, '#0a0a0a'],
    [0xe6, '#e6e6e6'],
  ])('%i → %s', (g, hex) => {
    expect(greyHex(g)).toBe(hex);
  });

  it('rounds fractional greys', () => {
    expect(greyHex(127.6)).toBe('#808080');
    expect(greyHex(127.4)).toBe('#7f7f7f');
  });

  it('clamps out-of-range greys', () => {
    expect(greyHex(-5)).toBe('#000000');
    expect(greyHex(300)).toBe('#ffffff');
  });
});

describe('escapeXml', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;',
    );
  });

  it('escapes & first so entities are not double-mangled', () => {
    expect(escapeXml('<&>')).toBe('&lt;&amp;&gt;');
    expect(escapeXml('&amp;')).toBe('&amp;amp;');
  });

  it('leaves plain text, including non-ASCII, unchanged', () => {
    expect(escapeXml('P1 · Letters — A–Z')).toBe('P1 · Letters — A–Z');
    expect(escapeXml('')).toBe('');
  });
});

describe('shapeToSvg: lines', () => {
  const line = (
    from: [number, number],
    to: [number, number],
    width: number,
    grey?: number,
  ): Shape => ({
    kind: 'line',
    from: {x: from[0], y: from[1]},
    to: {x: to[0], y: to[1]},
    width,
    grey,
  });

  it('puts an odd-width horizontal line on a half pixel', () => {
    const a = attrs(shapeToSvg(line([0, 10], [100, 10], 3)));
    expect(a).toMatchObject({x1: '0', y1: '10.5', x2: '100', y2: '10.5'});
    expect(a['stroke-width']).toBe('3');
  });

  it('puts an even-width horizontal line on a whole pixel', () => {
    const a = attrs(shapeToSvg(line([0, 10], [100, 10], 2)));
    expect(a).toMatchObject({x1: '0', y1: '10', x2: '100', y2: '10'});
  });

  it('puts an odd-width vertical line on a half pixel', () => {
    const a = attrs(shapeToSvg(line([50, 0], [50, 100], 1)));
    expect(a).toMatchObject({x1: '50.5', y1: '0', x2: '50.5', y2: '100'});
  });

  it('puts an even-width vertical line on a whole pixel', () => {
    const a = attrs(shapeToSvg(line([50, 0], [50, 100], 4)));
    expect(a).toMatchObject({x1: '50', y1: '0', x2: '50', y2: '100'});
  });

  it('snaps fractional coordinates of axis-aligned lines', () => {
    expect(attrs(shapeToSvg(line([0, 10.7], [9, 10.7], 2))).y1).toBe('11');
    expect(attrs(shapeToSvg(line([0, 10.7], [9, 10.7], 3))).y1).toBe('10.5');
  });

  it('does not snap the long axis or diagonal lines', () => {
    const a = attrs(shapeToSvg(line([0.25, 0], [10.75, 10], 3)));
    expect(a).toMatchObject({x1: '0.25', y1: '0', x2: '10.75', y2: '10'});
  });

  it('defaults to black, butt caps, and uses the given grey', () => {
    expect(attrs(shapeToSvg(line([0, 0], [1, 0], 1)))).toMatchObject({
      stroke: '#000000',
      'stroke-linecap': 'butt',
    });
    expect(attrs(shapeToSvg(line([0, 0], [1, 0], 1, 0x80))).stroke).toBe(
      '#808080',
    );
  });

  it('is a self-closing <line>', () => {
    expect(shapeToSvg(line([0, 0], [1, 0], 1))).toMatch(/^<line [^<>]*\/>$/);
  });
});

describe('shapeToSvg: rects', () => {
  const r = {left: 10, top: 20, right: 110, bottom: 120};

  it('draws an even stroke inside the rect', () => {
    const a = attrs(
      shapeToSvg({kind: 'rect', rect: r, strokeWidth: 4, stroke: 0}),
    );
    // Stroke centred 2 px in from each edge so it covers [10, 14) etc.
    expect(a).toEqual({
      x: '12',
      y: '22',
      width: '96',
      height: '96',
      fill: 'none',
      stroke: '#000000',
      'stroke-width': '4',
    });
  });

  it('draws an odd stroke inside the rect on half pixels', () => {
    const a = attrs(
      shapeToSvg({kind: 'rect', rect: r, strokeWidth: 3, stroke: 0}),
    );
    expect(a).toMatchObject({x: '11.5', y: '21.5', width: '97', height: '97'});
  });

  it('keeps the outer edge of the stroke on the rect edge', () => {
    for (const sw of [1, 2, 3, 4, 6]) {
      const a = attrs(
        shapeToSvg({kind: 'rect', rect: r, strokeWidth: sw, stroke: 0}),
      );
      const x = Number(a.x);
      const w = Number(a.width);
      expect(x - sw / 2).toBe(r.left);
      expect(x + w + sw / 2).toBe(r.right);
    }
  });

  it('fills a stroked rect when a fill is given', () => {
    const a = attrs(
      shapeToSvg({
        kind: 'rect',
        rect: r,
        strokeWidth: 4,
        stroke: 0,
        fill: 0xe6,
      }),
    );
    expect(a.fill).toBe('#e6e6e6');
    expect(a.stroke).toBe('#000000');
  });

  it('draws a fill-only rect at its exact edges with no stroke', () => {
    const svg = shapeToSvg({kind: 'rect', rect: r, strokeWidth: 0, fill: 0x9d});
    expect(svg).toBe(
      '<rect x="10" y="20" width="100" height="100" fill="#9d9d9d"/>',
    );
  });

  it('treats a missing stroke colour as fill-only', () => {
    const a = attrs(shapeToSvg({kind: 'rect', rect: r, strokeWidth: 3}));
    expect(a).toEqual({
      x: '10',
      y: '20',
      width: '100',
      height: '100',
      fill: '#000000',
    });
  });

  it('defaults a fill-only rect to black', () => {
    expect(attrs(shapeToSvg({kind: 'rect', rect: r})).fill).toBe('#000000');
  });
});

describe('shapeToSvg: text', () => {
  it('writes position, size, defaults and escaped content', () => {
    const svg = shapeToSvg({
      kind: 'text',
      at: {x: 5, y: 6},
      text: `Tom & Jerry's <b>`,
      size: 30,
    });
    expect(attrs(svg)).toEqual({
      x: '5',
      y: '6',
      'font-size': '30',
      'font-weight': '400',
      'text-anchor': 'start',
      fill: '#000000',
    });
    expect(svg).toMatch(/>Tom &amp; Jerry&apos;s &lt;b&gt;<\/text>$/);
  });

  it('uses the given weight, anchor and grey', () => {
    const a = attrs(
      shapeToSvg({
        kind: 'text',
        at: {x: 0, y: 0},
        text: 'x',
        size: 10,
        weight: 700,
        anchor: 'middle',
        grey: 0x60,
      }),
    );
    expect(a).toMatchObject({
      'font-weight': '700',
      'text-anchor': 'middle',
      fill: '#606060',
    });
  });
});

describe('layoutToSvg', () => {
  const layout: PageLayout = {
    id: 'test',
    title: 'Test',
    size: {width: 300, height: 400},
    shapes: [
      {kind: 'rect', rect: {left: 0, top: 0, right: 10, bottom: 10}, fill: 0},
      {kind: 'line', from: {x: 0, y: 5}, to: {x: 9, y: 5}, width: 1},
      {kind: 'text', at: {x: 1, y: 2}, text: 'A & B', size: 12},
      {kind: 'text', at: {x: 1, y: 20}, text: '"quoted"', size: 12},
    ],
    cells: [],
    groups: [],
    zones: [],
    areas: {},
  };
  const svg = layoutToSvg(layout);

  it('starts with <svg and ends with </svg>', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('sizes the root to the page', () => {
    expect(attrs(svg)).toMatchObject({
      xmlns: 'http://www.w3.org/2000/svg',
      width: '300',
      height: '400',
      viewBox: '0 0 300 400',
      'font-family': TEMPLATE_FONT_FAMILY,
    });
  });

  it('paints a white background over the whole page first', () => {
    const lines = svg.split('\n');
    expect(lines[1]).toBe(
      '<rect x="0" y="0" width="300" height="400" fill="#ffffff"/>',
    );
  });

  it('renders every shape in order', () => {
    const body = svg.split('\n').slice(2, -1);
    expect(body).toEqual(layout.shapes.map(shapeToSvg));
  });

  it('has one <text> per text shape, with escaped content', () => {
    expect(svg.match(/<text\b/g)).toHaveLength(2);
    expect(svg).toContain('>A &amp; B</text>');
    expect(svg).toContain('>&quot;quoted&quot;</text>');
    expect(svg).not.toContain('A & B');
  });

  it('is well-formed', () => {
    expect(checkWellFormed(svg)).toEqual([]);
  });

  it('renders an empty layout as just the root and background', () => {
    const empty = layoutToSvg({...layout, shapes: []});
    expect(empty.match(/<rect\b/g)).toHaveLength(1);
    expect(checkWellFormed(empty)).toEqual([]);
  });
});

describe('the self-check helper', () => {
  it('catches broken markup', () => {
    expect(checkWellFormed('<svg><text>a</svg>')).not.toEqual([]);
    expect(checkWellFormed('<svg><text>a & b</text></svg>')).not.toEqual([]);
    expect(checkWellFormed('<svg/><svg/>')).not.toEqual([]);
    expect(checkWellFormed('<svg><text>ok &amp;</text></svg>')).toEqual([]);
  });
});

describe.each([
  ['Manta', {width: 1920, height: 2560}],
  ['1404×1872', {width: 1404, height: 1872}],
])('rendering the probe pages (%s)', (_name, size) => {
  const pages = probePages(size);

  it.each(pages.map(p => [p.id, p] as const))(
    '%s is well-formed',
    (_id, page) => {
      const svg = layoutToSvg(page);
      expect(checkWellFormed(svg)).toEqual([]);
      expect((svg.match(/<text\b/g) ?? []).length).toBe(
        (svg.match(/<\/text>/g) ?? []).length,
      );
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    },
  );

  it.each(pages.map(p => [p.id, p] as const))(
    '%s has one <text> per text shape and one element per shape',
    (_id, page) => {
      const svg = layoutToSvg(page);
      const texts = page.shapes.filter(s => s.kind === 'text').length;
      expect((svg.match(/<text\b/g) ?? []).length).toBe(texts);
      const elements = (svg.match(/<(rect|line|text)\b/g) ?? []).length;
      expect(elements).toBe(page.shapes.length + 1); // + background
    },
  );

  it.each(pages.map(p => [p.id, p] as const))(
    '%s root matches the page size',
    (_id, page) => {
      expect(attrs(layoutToSvg(page))).toMatchObject({
        width: String(size.width),
        height: String(size.height),
        viewBox: `0 0 ${size.width} ${size.height}`,
      });
    },
  );
});
