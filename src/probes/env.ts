/** Environment probe and the startup line every log begins with. */
import {BUILD_INFO} from '../buildInfo';
import {PROBE_TEMPLATES} from '../assets/templates.generated';
import {logFile, templatePath} from '../sdk/paths';
import {describe, type Res} from '../sdk/result';
import {PERMISSION} from '../sdk/types';
import type {ProbeContext} from './context';

/** The SDK can't report the firmware version; this is what the owner told us. */
export const FIRMWARE_USER_REPORTED = 'Chauvet 3.31.45 (user-reported)';

export function startupLine(sdkVersion: string): string {
  return `Supernote Puzzles v${BUILD_INFO.versionName} (versionCode ${BUILD_INFO.versionCode}, ${BUILD_INFO.gitSha}, built ${BUILD_INFO.builtAt}) · sn-plugin-lib ${sdkVersion} · firmware ${FIRMWARE_USER_REPORTED}`;
}

function show<T>(r: Res<T>): unknown {
  return r.ok ? r.value : describe(r);
}

export async function runEnvProbe(
  ctx: ProbeContext,
  sdkVersion: string,
): Promise<string> {
  const tag = 'env';
  ctx.log.info(tag, startupLine(sdkVersion));
  const path = await ctx.sdk.getCurrentFilePath();
  const page = await ctx.sdk.getCurrentPageNum();
  const info: Record<string, unknown> = {
    deviceType: show(await ctx.sdk.getDeviceType()),
    pageDisplaySize: show(await ctx.sdk.getPageDisplaySize()),
    window: ctx.sdk.windowInfo(),
    pluginDir: show(await ctx.sdk.getPluginDirPath()),
    externalRoot: ctx.files.externalRoot,
    logFile: logFile(ctx.files.externalRoot),
    currentPath: show(path),
    currentPage: show(page),
    canHandwrite: show(await ctx.sdk.canHandwrite()),
    penInfo: show(await ctx.sdk.getPenInfo()),
  };
  if (path.ok && page.ok) {
    info.pageSize = show(await ctx.sdk.getPageSize(path.value, page.value));
    info.totalPages = show(await ctx.sdk.getNoteTotalPageNum(path.value));
    info.pageTemplate = show(
      await ctx.sdk.getNotePageTemplate(path.value, page.value),
    );
  }
  for (const [name, p] of Object.entries(PERMISSION)) {
    info[`permission.${name}`] = show(await ctx.sdk.hasPermission(p));
  }
  const templates: Record<string, boolean> = {};
  for (const t of PROBE_TEMPLATES) {
    templates[t.id] = await ctx.files.exists(
      templatePath(t.id, t.sha, ctx.files.externalRoot),
    );
  }
  info.templatesOnDevice = templates;
  ctx.log.info(tag, 'environment', info);
  return [
    startupLine(sdkVersion),
    `device type ${String(info.deviceType)}, page ${JSON.stringify(
      info.pageSize ?? info.pageDisplaySize,
    )}`,
    `open file: ${String(info.currentPath)} page ${String(info.currentPage)}`,
    `log file: ${info.logFile}`,
  ].join('\n');
}
