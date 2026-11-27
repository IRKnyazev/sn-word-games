import {describeBody, feedUrls, runNetworkProbe} from '../../src/probes/p5';
import {testContext} from '../helpers/fakes';

const WORDLE = JSON.stringify({
  id: 1,
  solution: 'secret',
  print_date: '2026-11-27',
  days_since_launch: 9,
  editor: 'E',
});
const CONNECTIONS = JSON.stringify({
  status: 'OK',
  categories: [
    {
      title: 'HIDDEN TITLE',
      cards: [
        {content: 'HIDDENWORD'},
        {content: 'B'},
        {content: 'C'},
        {content: 'D'},
      ],
    },
  ],
});

describe('P5 network', () => {
  it("builds today's URLs", () => {
    expect(feedUrls('2026-11-27').map(f => f.url)).toEqual([
      'https://www.nytimes.com/svc/wordle/v2/2026-11-27.json',
      'https://www.nytimes.com/svc/connections/v2/2026-11-27.json',
    ]);
  });

  it('describes bodies without answers', () => {
    const w = describeBody('wordle', JSON.parse(WORDLE));
    expect(w).toEqual({
      keys: ['days_since_launch', 'editor', 'id', 'print_date', 'solution'],
      solutionLength: 6,
      printDate: '2026-11-27',
    });
    expect(
      JSON.stringify(describeBody('connections', JSON.parse(CONNECTIONS))),
    ).not.toMatch(/HIDDEN/);
    expect(describeBody('x', 'str')).toEqual({type: 'string'});
  });

  it('logs status and shape, never the answers', async () => {
    const ctx = testContext(undefined, {
      fetch: async url => ({
        status: 200,
        contentType: 'application/json',
        text: async () => (url.includes('wordle') ? WORDLE : CONNECTIONS),
      }),
    });
    const summary = await runNetworkProbe(ctx);
    expect(summary).toMatch(/wordle: HTTP 200/);
    expect(summary).toMatch(/connections: HTTP 200/);
    const all = ctx.lines().join('\n');
    expect(all).not.toContain('secret');
    expect(all).not.toContain('HIDDEN');
  });

  it('never echoes a body that fails to parse', async () => {
    const ctx = testContext(undefined, {
      fetch: async () => ({
        status: 200,
        contentType: 'application/json',
        text: async () => '\ufeff{"id":1,"solution":"secret"',
      }),
    });
    await runNetworkProbe(ctx);
    const all = ctx.lines().join('\n');
    expect(all).not.toContain('secret');
    expect(all).toContain('broken JSON');
  });

  it('reports network errors and non-JSON bodies', async () => {
    let n = 0;
    const ctx = testContext(undefined, {
      fetch: async () => {
        if (n++ === 0) {
          throw new TypeError('Network request failed');
        }
        return {
          status: 403,
          contentType: 'text/html',
          text: async () => '<html>',
        };
      },
    });
    const summary = await runNetworkProbe(ctx);
    expect(summary).toMatch(
      /wordle: failed \(TypeError: Network request failed\)/,
    );
    expect(summary).toMatch(/connections: HTTP 403/);
    expect(ctx.lines().join('\n')).toContain('markup');
  });
});
