import type {Logger} from '../diag/logger';
import {describe} from './result';
import type {Permission, Sdk} from './types';

/** hasPermission: 0 no, 1 this time, 2 always. requestPermission: -1 dismissed, 0 refused, 1, 2. */
export function isGranted(code: number | undefined): boolean {
  return code === 1 || code === 2;
}

/**
 * Checks a permission and asks for it if needed. If the firmware has no
 * permission API (older builds), the call fails and we carry on as granted.
 */
export async function ensurePermission(
  sdk: Sdk,
  permission: Permission,
  why: string,
  log: Logger,
): Promise<boolean> {
  const has = await sdk.hasPermission(permission);
  if (has.ok && isGranted(has.value)) {
    return true;
  }
  if (!has.ok) {
    log.warn(
      'perm',
      `hasPermission(${permission}) ${describe(has)}; assuming granted`,
    );
    return true;
  }
  const req = await sdk.requestPermission(permission, why);
  const granted = req.ok && isGranted(req.value);
  log.info(
    'perm',
    `requestPermission(${permission}) → ${req.ok ? req.value : describe(req)}`,
    {
      granted,
    },
  );
  return granted;
}
