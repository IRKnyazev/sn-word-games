/**
 * P5 network: HTTPS fetch of today's public NYT JSON from the PluginHost.
 * Logs status, timing, size and field names. Never logs answers.
 */
import {localDate} from '../sdk/paths';
import type {ProbeContext} from './context';

const TAG = 'P5';

export function feedUrls(date: string): {name: string; url: string}[] {
  return [
    {name: 'wordle', url: `https://www.nytimes.com/svc/wordle/v2/${date}.json`},
    {
      name: 'connections',
      url: `https://www.nytimes.com/svc/connections/v2/${date}.json`,
    },
  ];
}

/** A spoiler-free description of a feed body. */
export function describeBody(
  name: string,
  body: unknown,
): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    return {type: typeof body};
  }
  const obj = body as Record<string, unknown>;
  const out: Record<string, unknown> = {keys: Object.keys(obj).sort()};
  if (name === 'wordle') {
    out.solutionLength =
      typeof obj.solution === 'string' ? obj.solution.length : null;
    out.printDate = obj.print_date ?? null;
  }
  if (name === 'connections' && Array.isArray(obj.categories)) {
    out.categories = obj.categories.length;
    out.cardsPerCategory = obj.categories.map(c =>
      c &&
      typeof c === 'object' &&
      Array.isArray((c as {cards?: unknown}).cards)
        ? (c as {cards: unknown[]}).cards.length
        : null,
    );
  }
  return out;
}

/** What a non-JSON body looks like, without echoing any of it. */
export function bodyKind(text: string): string {
  const c = text.trimStart()[0];
  return c === '<'
    ? 'markup'
    : c === '{' || c === '['
    ? 'broken JSON'
    : c
    ? 'other'
    : 'empty';
}

export async function runNetworkProbe(ctx: ProbeContext): Promise<string> {
  const date = localDate(ctx.date());
  const lines: string[] = [];
  for (const {name, url} of feedUrls(date)) {
    const start = ctx.now();
    try {
      const res = await ctx.fetch(url, 20000);
      const text = await res.text();
      const ms = ctx.now() - start;
      let shape: Record<string, unknown> = {};
      try {
        shape = describeBody(name, JSON.parse(text));
      } catch {
        shape = {parse: 'not JSON', startsWith: bodyKind(text)};
      }
      ctx.log.info(
        TAG,
        `${name} HTTP ${res.status} in ${ms} ms, ${text.length} bytes`,
        {
          url,
          contentType: res.contentType,
          ...shape,
        },
      );
      lines.push(`${name}: HTTP ${res.status}, ${ms} ms, ${text.length} bytes`);
    } catch (e) {
      const ms = ctx.now() - start;
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      ctx.log.error(TAG, `${name} failed after ${ms} ms: ${msg}`, {url});
      lines.push(`${name}: failed (${msg})`);
    }
  }
  return lines.join('\n');
}
