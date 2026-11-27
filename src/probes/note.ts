/** "Create probe note": write the template PNGs, create a 3-page note, open it. */
import {
  PROBE_TEMPLATES,
  TILE_PNGS,
  type EmbeddedPng,
} from '../assets/templates.generated';
import {noteDir, probeNotePath, templateDir, templatePath} from '../sdk/paths';
import {describe} from '../sdk/result';
import type {ProbeContext} from './context';

/** Writes an embedded PNG under MyStyle/SupernotePuzzles unless it's already there. */
export async function ensurePng(
  ctx: ProbeContext,
  png: EmbeddedPng,
): Promise<string> {
  const root = ctx.files.externalRoot;
  const path = templatePath(png.id, png.sha, root);
  if (!(await ctx.files.exists(path))) {
    await ctx.files.mkdir(templateDir(root));
    await ctx.files.writeBase64(path, png.base64);
    ctx.log.info('png', `wrote ${path}`, {
      bytes: Math.floor((png.base64.length * 3) / 4),
    });
  }
  return path;
}

export async function ensureTiles(
  ctx: ProbeContext,
): Promise<{dark: string; light: string}> {
  return {
    dark: await ensurePng(ctx, TILE_PNGS.dark),
    light: await ensurePng(ctx, TILE_PNGS.light),
  };
}

export async function createProbeNote(ctx: ProbeContext): Promise<string> {
  const tag = 'note';
  const templates: string[] = [];
  for (const t of PROBE_TEMPLATES) {
    templates.push(await ensurePng(ctx, t));
  }
  const root = ctx.files.externalRoot;
  await ctx.files.mkdir(noteDir(root));
  const notePath = probeNotePath(ctx.date(), root);

  const created = await ctx.sdk.createNote({
    notePath,
    template: templates[0],
    mode: 0,
    isPortrait: true,
  });
  ctx.log.info(tag, `createNote ${describe(created)}`, {
    notePath,
    template: templates[0],
  });
  if (!created.ok) {
    return created.code === 102
      ? 'createNote refused (102): open any note first, then use the Puzzles button from that note.'
      : `createNote failed: ${describe(created)}`;
  }

  // insertNotePage's page semantics aren't documented: try appending at the
  // current page count, then after the last page, and log which worked.
  for (let i = 1; i < templates.length; i++) {
    const before = await ctx.sdk.getNoteTotalPageNum(notePath);
    const count = before.ok ? before.value : i;
    let res = await ctx.sdk.insertNotePage({
      notePath,
      page: count,
      template: templates[i],
    });
    ctx.log.info(tag, `insertNotePage(page=${count}) ${describe(res)}`);
    if (!res.ok) {
      res = await ctx.sdk.insertNotePage({
        notePath,
        page: Math.max(0, count - 1),
        template: templates[i],
      });
      ctx.log.info(tag, `insertNotePage(page=${count - 1}) ${describe(res)}`);
    }
  }

  const total = await ctx.sdk.getNoteTotalPageNum(notePath);
  ctx.log.info(
    tag,
    `getNoteTotalPageNum ${total.ok ? total.value : describe(total)}`,
  );
  const pages = total.ok ? total.value : templates.length;
  for (let p = 0; p < pages; p++) {
    const t = await ctx.sdk.getNotePageTemplate(notePath, p);
    ctx.log.info(tag, `page ${p + 1} template`, t.ok ? t.value : describe(t));
  }

  const closed = await ctx.sdk.closePluginView();
  ctx.log.info(tag, `closePluginView ${describe(closed)}`);
  const opened = await ctx.sdk.openNote(notePath, 0);
  ctx.log.info(tag, `openNote ${describe(opened)}`);
  const name = notePath.slice(notePath.lastIndexOf('/') + 1);
  return opened.ok
    ? `Created and opened "${name}" (${pages} pages).`
    : `Created "${name}" (${pages} pages) in Note/SupernotePuzzles, but couldn't open it: open it by hand.`;
}
