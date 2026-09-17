/**
 * Safe auth verification for Google Play reviewer accounts.
 * Uses the same POST /auth/login endpoint as Flutter.
 *
 * Never prints passwords or tokens.
 *
 * Requires CONFIRM_GOOGLE_PLAY_REVIEWER_AUTH_TEST=YES
 */

import {
  PRIMARY,
  SECONDARY,
  authMe,
  login,
  logFail,
  logStep,
  normalizeEmail,
  optionalEnv,
  printTargetEnvironment,
  requireEnv,
  resolveApiBase,
} from './lib/google-play-reviewer-common';

async function main(): Promise<void> {
  if (process.env.CONFIRM_GOOGLE_PLAY_REVIEWER_AUTH_TEST !== 'YES') {
    logFail('Refusing to run: set CONFIRM_GOOGLE_PLAY_REVIEWER_AUTH_TEST=YES');
    process.exit(1);
  }

  const apiBase = resolveApiBase();
  printTargetEnvironment(apiBase);

  const primaryEmail = normalizeEmail(
    optionalEnv(PRIMARY.emailEnv, PRIMARY.defaultEmail),
  );
  const secondaryEmail = normalizeEmail(
    optionalEnv(SECONDARY.emailEnv, SECONDARY.defaultEmail),
  );
  const primaryPassword = requireEnv(PRIMARY.passwordEnv);
  const secondaryPassword = requireEnv(SECONDARY.passwordEnv);

  let failed = false;

  try {
    const tokens = await login(apiBase, primaryEmail, primaryPassword);
    if (!tokens.accessToken) throw new Error('no accessToken');
    const me = await authMe(apiBase, tokens.accessToken);
    if (normalizeEmail(me.email) !== primaryEmail) throw new Error('email mismatch');
    if (me.lifecycleStatus !== 'ACTIVE' || me.isSuspended) {
      throw new Error('account not active');
    }
    logStep('Primary reviewer login: PASS');
  } catch (err) {
    failed = true;
    logFail(`Primary reviewer login: FAIL (${(err as Error).message})`);
  }

  try {
    const tokens = await login(apiBase, secondaryEmail, secondaryPassword);
    if (!tokens.accessToken) throw new Error('no accessToken');
    await authMe(apiBase, tokens.accessToken);
    logStep('Secondary reviewer login: PASS');
  } catch (err) {
    failed = true;
    logFail(`Secondary reviewer login: FAIL (${(err as Error).message})`);
  }

  try {
    await login(apiBase, primaryEmail, `${primaryPassword}__wrong__`);
    failed = true;
    logFail('Wrong-password rejection: FAIL (unexpected success)');
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg = (err as Error).message;
    if (status === 401 || msg.includes('HTTP 401')) {
      logStep('Wrong-password rejection: PASS');
    } else {
      failed = true;
      logFail(`Wrong-password rejection: FAIL (${msg})`);
    }
  }

  if (failed) process.exit(1);
}

main().catch((err) => {
  logFail(`FATAL: ${(err as Error).message}`);
  process.exit(1);
});
