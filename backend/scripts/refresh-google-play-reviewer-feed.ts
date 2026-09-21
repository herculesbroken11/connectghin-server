/**
 * Refresh the Google Play reviewer demo Feed post (normal Feed API only).
 * Use when the previous demo roundDate has expired.
 *
 * Requires:
 *   CONFIRM_GOOGLE_PLAY_REVIEWER_FEED_REFRESH=YES
 *   GOOGLE_PLAY_REVIEWER2_EMAIL / GOOGLE_PLAY_REVIEWER2_PASSWORD
 *   (optional) GOOGLE_PLAY_REVIEWER_EMAIL / GOOGLE_PLAY_REVIEWER_PASSWORD to verify visibility
 */

import {
  FEED_COURSE,
  FEED_NOTES,
  PRIMARY,
  REVIEW_LOCATION,
  SECONDARY,
  api,
  authMe,
  futureRoundDateIso,
  login,
  logFail,
  logStep,
  normalizeEmail,
  optionalEnv,
  printTargetEnvironment,
  requireEnv,
  resolveApiBase,
} from './lib/google-play-reviewer-common';

type FeedList = {
  items?: Array<{
    id: string;
    userId?: string;
    posterId?: string;
    courseName?: string;
    notes?: string | null;
  }>;
};

async function main(): Promise<void> {
  if (process.env.CONFIRM_GOOGLE_PLAY_REVIEWER_FEED_REFRESH !== 'YES') {
    logFail('Refusing: set CONFIRM_GOOGLE_PLAY_REVIEWER_FEED_REFRESH=YES');
    process.exit(1);
  }

  const apiBase = resolveApiBase();
  printTargetEnvironment(apiBase);

  const secondaryEmail = normalizeEmail(
    optionalEnv(SECONDARY.emailEnv, SECONDARY.defaultEmail),
  );
  const secondaryPassword = requireEnv(SECONDARY.passwordEnv);
  const secondaryTokens = await login(apiBase, secondaryEmail, secondaryPassword);
  const secondaryMe = await authMe(apiBase, secondaryTokens.accessToken);

  const created = await api<{ id?: string }>(apiBase, '/foursome-feed', {
    method: 'POST',
    token: secondaryTokens.accessToken,
    body: JSON.stringify({
      courseName: FEED_COURSE,
      city: REVIEW_LOCATION.city,
      state: REVIEW_LOCATION.state,
      roundDate: futureRoundDateIso(45),
      teeTime: '9:00 AM',
      spotsNeeded: 2,
      gameStyle: 'CASUAL',
      handicapPreference: 'Any',
      notes: FEED_NOTES,
    }),
  });
  logStep(`[Feed] Created CASUAL demo post id=${created.id ?? '(unknown)'}`);

  const primaryEmail = normalizeEmail(
    optionalEnv(PRIMARY.emailEnv, PRIMARY.defaultEmail),
  );
  const primaryPassword = process.env[PRIMARY.passwordEnv]?.trim();
  if (primaryPassword) {
    const primaryTokens = await login(apiBase, primaryEmail, primaryPassword);
    const list = await api<FeedList>(apiBase, '/foursome-feed?page=0&pageSize=50&gameStyle=CASUAL', {
      token: primaryTokens.accessToken,
    });
    const visible = (list.items ?? []).some(
      (p) =>
        (created.id && p.id === created.id) ||
        ((p.userId === secondaryMe.id || p.posterId === secondaryMe.id) &&
          p.notes === FEED_NOTES),
    );
    logStep(`[Feed] Visible to primary on Casual tab: ${visible ? 'YES' : 'NO'}`);
    if (!visible) process.exit(1);
  }

  logStep('DONE');
}

main().catch((err) => {
  logFail(`FATAL: ${(err as Error).message}`);
  process.exit(1);
});
