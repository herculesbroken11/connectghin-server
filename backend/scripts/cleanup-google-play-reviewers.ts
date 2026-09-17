/**
 * Cleanup Google Play reviewer accounts AFTER Google Play review is fully complete.
 *
 * DO NOT RUN during active review.
 *
 * Targets ONLY:
 *   reviewer@connectghin.com
 *   reviewer2@connectghin.com
 *
 * Uses existing admin soft-delete: DELETE /admin/users/:id
 * (archives email/username, sets lifecycleStatus=DELETED).
 *
 * Requires:
 *   CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP=YES
 *   CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP_EMAILS=reviewer@connectghin.com,reviewer2@connectghin.com
 *   ADMIN_API_EMAIL / ADMIN_API_PASSWORD
 */

import {
  PRIMARY,
  SECONDARY,
  api,
  adminLogin,
  logFail,
  logStep,
  normalizeEmail,
  printTargetEnvironment,
  requireEnv,
  resolveApiBase,
} from './lib/google-play-reviewer-common';

const ALLOWED = new Set([
  normalizeEmail(PRIMARY.defaultEmail),
  normalizeEmail(SECONDARY.defaultEmail),
]);

type AdminSearch = {
  users?: Array<{ id: string; email: string; username: string }>;
};

async function findExactUser(
  apiBase: string,
  adminToken: string,
  email: string,
): Promise<{ id: string; email: string; username: string } | null> {
  const result = await api<AdminSearch>(
    apiBase,
    `/admin/search?q=${encodeURIComponent(email)}`,
    { token: adminToken },
  );
  const exact = (result.users ?? []).find(
    (u) => normalizeEmail(u.email) === normalizeEmail(email),
  );
  return exact ?? null;
}

async function main(): Promise<void> {
  if (process.env.CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP !== 'YES') {
    logFail(
      'Refusing to run: set CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP=YES only AFTER Google Play review is completely finished.',
    );
    process.exit(1);
  }

  const emailsRaw = requireEnv('CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP_EMAILS');
  const emails = emailsRaw
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean);

  if (emails.length !== 2 || emails.some((e) => !ALLOWED.has(e))) {
    logFail(
      'CONFIRM_GOOGLE_PLAY_REVIEWER_CLEANUP_EMAILS must be exactly: ' +
        `${PRIMARY.defaultEmail},${SECONDARY.defaultEmail}`,
    );
    process.exit(1);
  }

  const unexpected = emails.filter((e) => !ALLOWED.has(e));
  if (unexpected.length) {
    logFail(`Refusing unexpected emails: ${unexpected.join(', ')}`);
    process.exit(1);
  }

  const apiBase = resolveApiBase();
  printTargetEnvironment(apiBase);

  logStep(
    'WARNING: This soft-deletes the two reviewer accounts via admin DELETE. Related Match/messages remain structurally per existing deletion logic.',
  );

  const adminTokens = await adminLogin(
    apiBase,
    requireEnv('ADMIN_API_EMAIL'),
    requireEnv('ADMIN_API_PASSWORD'),
  );

  for (const email of emails) {
    const user = await findExactUser(apiBase, adminTokens.accessToken, email);
    if (!user) {
      logStep(`[Cleanup] ${email}: not found (already removed?) — skipped`);
      continue;
    }
    if (
      (email === normalizeEmail(PRIMARY.defaultEmail) && user.username !== PRIMARY.username) ||
      (email === normalizeEmail(SECONDARY.defaultEmail) && user.username !== SECONDARY.username)
    ) {
      logFail(
        `[Cleanup] Refusing ${email}: username ${user.username} does not match expected reviewer username.`,
      );
      process.exit(1);
    }

    await api(apiBase, `/admin/users/${user.id}`, {
      method: 'DELETE',
      token: adminTokens.accessToken,
    });
    logStep(`[Cleanup] Soft-deleted ${email} (username was ${user.username})`);
  }

  logStep('Cleanup finished. Do not recreate until a new Play review needs them.');
}

main().catch((err) => {
  logFail(`FATAL: ${(err as Error).message}`);
  process.exit(1);
});
