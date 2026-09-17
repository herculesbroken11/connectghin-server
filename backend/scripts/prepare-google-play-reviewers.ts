/**
 * Prepare Google Play reviewer accounts via production HTTP APIs only.
 *
 * SAFETY:
 * - Does nothing unless CONFIRM_GOOGLE_PLAY_REVIEWER_SETUP=YES
 * - Never logs passwords, hashes, or JWT/refresh tokens
 * - Never uses raw SQL or direct passwordHash writes
 * - Idempotent for the exact reviewer email/username pairs
 *
 * Run (DO NOT run until explicitly approved):
 *   CONFIRM_GOOGLE_PLAY_REVIEWER_SETUP=YES \
 *   GOOGLE_PLAY_REVIEWER_EMAIL=reviewer@connectghin.com \
 *   GOOGLE_PLAY_REVIEWER_PASSWORD='***' \
 *   GOOGLE_PLAY_REVIEWER2_EMAIL=reviewer2@connectghin.com \
 *   GOOGLE_PLAY_REVIEWER2_PASSWORD='***' \
 *   ADMIN_API_EMAIL='***' \
 *   ADMIN_API_PASSWORD='***' \
 *   npm run prepare:google-play-reviewers
 */

import {
  DEMO_MESSAGE,
  FEED_COURSE,
  FEED_NOTES,
  PRIMARY,
  PREMIUM_OVERRIDE_REASON,
  REVIEW_LOCATION,
  SECONDARY,
  api,
  assertIdentity,
  authMe,
  adminLogin,
  futureRoundDateIso,
  login,
  logFail,
  logStep,
  normalizeEmail,
  optionalEnv,
  printTargetEnvironment,
  register,
  requireEnv,
  resolveApiBase,
  type AuthMe,
  type TokenPair,
} from './lib/google-play-reviewer-common';

type ProfileMe = {
  userId?: string;
  displayName?: string;
  profileCompletionPercent?: number;
  isGHINVerified?: boolean;
  user?: {
    id?: string;
    profilePhotos?: unknown[];
    isPremium?: boolean;
  };
  isPremium?: boolean;
};

type SwipeResult = {
  matched?: boolean;
  connectionStatus?: string;
  success?: boolean;
};

type Conversation = {
  id: string;
  participants?: Array<{ userId: string }>;
};

type FeedListItem = {
  id: string;
  /** Feed API mapPostRow exposes poster as userId/posterId (not posterUserId). */
  userId?: string;
  posterId?: string;
  courseName?: string;
  notes?: string | null;
};

type FeedList = {
  items?: FeedListItem[];
  isPremiumViewer?: boolean;
};

function feedPosterId(item: FeedListItem): string | undefined {
  return item.userId ?? item.posterId;
}

type AdminUserDetail = {
  id?: string;
  premium?: {
    isPremium?: boolean;
    premiumOverride?: boolean;
    premiumOverrideExpiresAt?: string | null;
    premiumOverrideReason?: string | null;
  };
};

type ReviewerSpec = {
  label: string;
  email: string;
  password: string;
  username: string;
  displayName: string;
  lat: number;
  lng: number;
};

async function ensureReviewerAccount(
  apiBase: string,
  spec: ReviewerSpec,
): Promise<{ tokens: TokenPair; me: AuthMe; created: boolean }> {
  logStep(`[${spec.label}] Ensuring account ${normalizeEmail(spec.email)} / ${spec.username}`);

  try {
    const tokens = await register(apiBase, spec.email, spec.username, spec.password);
    const me = await authMe(apiBase, tokens.accessToken);
    assertIdentity(me, spec.email, spec.username);
    logStep(`[${spec.label}] Created via POST /auth/register`);
    return { tokens, me, created: true };
  } catch (err) {
    const status = (err as { status?: number }).status;
    const body = (err as { body?: unknown }).body;
    const msg = JSON.stringify(body ?? '');
    const looksConflict =
      status === 400 &&
      (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('in use'));

    if (!looksConflict && status !== 409) {
      throw err;
    }

    logStep(`[${spec.label}] Register reported existing identity — attempting login reuse`);
    let tokens: TokenPair;
    try {
      tokens = await login(apiBase, spec.email, spec.password);
    } catch (loginErr) {
      throw new Error(
        `[${spec.label}] Email/username appears taken but login failed. ` +
          `Refusing to overwrite. Resolve manually (wrong password or unrelated username collision). ` +
          `Detail: ${(loginErr as Error).message}`,
      );
    }

    const me = await authMe(apiBase, tokens.accessToken);
    assertIdentity(me, spec.email, spec.username);
    logStep(`[${spec.label}] Reused existing account (identity matched)`);
    return { tokens, me, created: false };
  }
}

async function updateProfile(
  apiBase: string,
  token: string,
  spec: ReviewerSpec,
): Promise<ProfileMe> {
  const body = {
    displayName: spec.displayName,
    bio: 'Official Google Play review account for Connectghin. Neutral demo profile.',
    age: 35,
    city: REVIEW_LOCATION.city,
    state: REVIEW_LOCATION.state,
    country: REVIEW_LOCATION.country,
    locationLat: spec.lat,
    locationLng: spec.lng,
    homeCourse: REVIEW_LOCATION.homeCourse,
    lookingFor: 'Casual weekend rounds with friendly golfers',
    skillLevel: 'Intermediate',
    playFrequency: 'Weekly',
    gender: 'Prefer not to say',
    drinkingPreference: 'Prefer not to say',
    smokingPreference: 'No',
    musicPreference: 'Sometimes',
    // Self-reported only; isGHINVerified remains false via normal registration/profile path
    handicap: 18.0,
  };

  await api(apiBase, '/profiles/me', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });

  return api<ProfileMe>(apiBase, '/profiles/me', { token });
}

async function grantPremiumOverride(
  apiBase: string,
  adminToken: string,
  userId: string,
  label: string,
): Promise<'created' | 'already'> {
  const detail = await api<AdminUserDetail>(apiBase, `/admin/users/${userId}`, {
    token: adminToken,
  });
  const already =
    detail.premium?.premiumOverride === true &&
    detail.premium?.premiumOverrideExpiresAt == null &&
    detail.premium?.isPremium === true;

  if (already) {
    logStep(`[${label}] Premium admin override already active (no expiry)`);
    return 'already';
  }

  await api(apiBase, `/admin/users/${userId}/premium-override`, {
    method: 'PATCH',
    token: adminToken,
    body: JSON.stringify({
      enabled: true,
      expiresAt: null,
      reason: PREMIUM_OVERRIDE_REASON,
    }),
  });
  logStep(`[${label}] Premium admin override granted (no expiry; reason="${PREMIUM_OVERRIDE_REASON}")`);
  return 'created';
}

async function ensureMutualMatch(
  apiBase: string,
  primaryToken: string,
  secondaryToken: string,
  primaryId: string,
  secondaryId: string,
): Promise<{ matched: boolean; already: boolean }> {
  const a = await api<SwipeResult>(apiBase, '/swipes', {
    method: 'POST',
    token: primaryToken,
    body: JSON.stringify({ toUserId: secondaryId, action: 'LIKE' }),
  });
  logStep(`[Match] reviewer → reviewer2: status=${a.connectionStatus ?? 'ok'} matched=${Boolean(a.matched)}`);

  const b = await api<SwipeResult>(apiBase, '/swipes', {
    method: 'POST',
    token: secondaryToken,
    body: JSON.stringify({ toUserId: primaryId, action: 'LIKE' }),
  });
  logStep(`[Match] reviewer2 → reviewer: status=${b.connectionStatus ?? 'ok'} matched=${Boolean(b.matched)}`);

  const matched = Boolean(a.matched || b.matched);
  if (!matched) {
    throw new Error('Mutual LIKE did not produce a Match. Aborting.');
  }
  // If both already liked, second call still reports matched=true via reciprocal check
  const already = a.connectionStatus === 'updated' && b.connectionStatus === 'updated';
  return { matched, already };
}

async function ensureConversationAndMessage(
  apiBase: string,
  primaryToken: string,
  secondaryId: string,
): Promise<{ conversationId: string; messageCreated: boolean }> {
  const started = await api<Conversation>(apiBase, '/conversations/start', {
    method: 'POST',
    token: primaryToken,
    body: JSON.stringify({ otherUserId: secondaryId }),
  });
  const conversationId = started.id;
  if (!conversationId) {
    throw new Error('startConversation did not return an id');
  }

  const messages = await api<Array<{ body?: string }>>(
    apiBase,
    `/conversations/${conversationId}/messages`,
    { token: primaryToken },
  );
  const exists = Array.isArray(messages) && messages.some((m) => m.body === DEMO_MESSAGE);
  if (exists) {
    logStep('[Chat] Demo message already present — skipped');
    return { conversationId, messageCreated: false };
  }

  await api(apiBase, `/conversations/${conversationId}/messages`, {
    method: 'POST',
    token: primaryToken,
    body: JSON.stringify({ body: DEMO_MESSAGE }),
  });
  logStep('[Chat] Demo message created');
  return { conversationId, messageCreated: true };
}

async function findDemoFeedPost(
  apiBase: string,
  primaryToken: string,
  secondaryId: string,
): Promise<FeedListItem | null> {
  // Feed is ordered by roundDate asc; paginate so a mid-horizon demo post is still found.
  for (let page = 0; page < 5; page += 1) {
    const list = await api<FeedList>(
      apiBase,
      `/foursome-feed?page=${page}&pageSize=50`,
      { token: primaryToken },
    );
    const items = list.items ?? [];
    const found = items.find(
      (p) =>
        feedPosterId(p) === secondaryId &&
        p.notes === FEED_NOTES &&
        p.courseName === FEED_COURSE,
    );
    if (found) return found;
    if (items.length < 50) break;
  }
  return null;
}

async function ensureFeedPost(
  apiBase: string,
  primaryToken: string,
  secondaryToken: string,
  secondaryId: string,
): Promise<{ postId: string | null; created: boolean; visibleToPrimary: boolean }> {
  const found = await findDemoFeedPost(apiBase, primaryToken, secondaryId);
  if (found?.id) {
    logStep(`[Feed] Demo post already visible to primary (id=${found.id})`);
    return { postId: found.id, created: false, visibleToPrimary: true };
  }

  const created = await api<{ id?: string }>(apiBase, '/foursome-feed', {
    method: 'POST',
    token: secondaryToken,
    body: JSON.stringify({
      courseName: FEED_COURSE,
      city: REVIEW_LOCATION.city,
      state: REVIEW_LOCATION.state,
      // Dynamic future date (not a fixed calendar day that can go stale in source).
      roundDate: futureRoundDateIso(3),
      teeTime: '9:00 AM',
      spotsNeeded: 2,
      gameStyle: 'CASUAL',
      handicapPreference: 'Any',
      notes: FEED_NOTES,
    }),
  });

  const postId = created.id ?? null;
  logStep(`[Feed] Created demo post from reviewer2${postId ? ` (id=${postId})` : ''}`);

  let visibleToPrimary = false;
  if (postId) {
    try {
      await api(apiBase, `/foursome-feed/${postId}`, { token: primaryToken });
      visibleToPrimary = true;
    } catch {
      visibleToPrimary = false;
    }
  }
  if (!visibleToPrimary) {
    const again = await findDemoFeedPost(apiBase, primaryToken, secondaryId);
    visibleToPrimary = Boolean(again?.id);
  }
  logStep(`[Feed] Visible to primary reviewer: ${visibleToPrimary ? 'YES' : 'NO'}`);
  return { postId, created: true, visibleToPrimary };
}

async function verifyLogins(
  apiBase: string,
  primaryEmail: string,
  primaryPassword: string,
  secondaryEmail: string,
  secondaryPassword: string,
): Promise<void> {
  logStep('--- Auth verification (tokens not printed) ---');

  try {
    const t = await login(apiBase, primaryEmail, primaryPassword);
    if (!t.accessToken) throw new Error('missing accessToken');
    const me = await authMe(apiBase, t.accessToken);
    if (me.lifecycleStatus !== 'ACTIVE') throw new Error(`lifecycle=${me.lifecycleStatus}`);
    logStep('Primary reviewer login: PASS');
  } catch (err) {
    logFail(`Primary reviewer login: FAIL (${(err as Error).message})`);
    throw err;
  }

  try {
    const t = await login(apiBase, secondaryEmail, secondaryPassword);
    if (!t.accessToken) throw new Error('missing accessToken');
    await authMe(apiBase, t.accessToken);
    logStep('Secondary reviewer login: PASS');
  } catch (err) {
    logFail(`Secondary reviewer login: FAIL (${(err as Error).message})`);
    throw err;
  }

  try {
    await login(apiBase, primaryEmail, `${primaryPassword}__wrong__`);
    logFail('Wrong-password rejection: FAIL (login unexpectedly succeeded)');
    throw new Error('Wrong password was accepted');
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      logStep('Wrong-password rejection: PASS');
      return;
    }
    // login() throws on non-OK; if message indicates auth failure without status, still treat carefully
    if ((err as Error).message.includes('HTTP 401')) {
      logStep('Wrong-password rejection: PASS');
      return;
    }
    if ((err as Error).message === 'Wrong password was accepted') throw err;
    logFail(`Wrong-password rejection: FAIL (${(err as Error).message})`);
    throw err;
  }
}

async function main(): Promise<void> {
  if (process.env.CONFIRM_GOOGLE_PLAY_REVIEWER_SETUP !== 'YES') {
    logFail(
      'Refusing to run: set CONFIRM_GOOGLE_PLAY_REVIEWER_SETUP=YES to modify/create reviewer accounts.',
    );
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
  const adminEmail = requireEnv('ADMIN_API_EMAIL');
  const adminPassword = requireEnv('ADMIN_API_PASSWORD');

  if (primaryEmail !== PRIMARY.defaultEmail || secondaryEmail !== SECONDARY.defaultEmail) {
    logFail(
      `Refusing unexpected reviewer emails. Expected ${PRIMARY.defaultEmail} and ${SECONDARY.defaultEmail}.`,
    );
    process.exit(1);
  }

  logStep('Admin login for Premium override…');
  const adminTokens = await adminLogin(apiBase, adminEmail, adminPassword);

  const primarySpec: ReviewerSpec = {
    label: 'Primary',
    email: primaryEmail,
    password: primaryPassword,
    username: PRIMARY.username,
    displayName: PRIMARY.displayName,
    lat: REVIEW_LOCATION.primary.lat,
    lng: REVIEW_LOCATION.primary.lng,
  };
  const secondarySpec: ReviewerSpec = {
    label: 'Secondary',
    email: secondaryEmail,
    password: secondaryPassword,
    username: SECONDARY.username,
    displayName: SECONDARY.displayName,
    lat: REVIEW_LOCATION.secondary.lat,
    lng: REVIEW_LOCATION.secondary.lng,
  };

  const primary = await ensureReviewerAccount(apiBase, primarySpec);
  const secondary = await ensureReviewerAccount(apiBase, secondarySpec);

  logStep('[Terms] Checking Terms acceptance from registration…');
  for (const [label, me] of [
    ['Primary', primary.me],
    ['Secondary', secondary.me],
  ] as const) {
    if (me.needsTermsAcceptance || me.termsVersion !== me.currentTermsVersion) {
      throw new Error(
        `[${label}] Terms not accepted for current version (have=${me.termsVersion}, need=${me.currentTermsVersion})`,
      );
    }
    logStep(`[${label}] Terms OK (version=${me.termsVersion})`);
  }

  const primaryProfile = await updateProfile(apiBase, primary.tokens.accessToken, primarySpec);
  const secondaryProfile = await updateProfile(
    apiBase,
    secondary.tokens.accessToken,
    secondarySpec,
  );

  const primaryPct = primaryProfile.profileCompletionPercent ?? 0;
  const secondaryPct = secondaryProfile.profileCompletionPercent ?? 0;
  const primaryPhotos = primaryProfile.user?.profilePhotos?.length ?? 0;
  const secondaryPhotos = secondaryProfile.user?.profilePhotos?.length ?? 0;

  logStep(
    `[Primary] Profile updated; completion=${primaryPct}%; photos=${primaryPhotos}; isGHINVerified=${Boolean(primaryProfile.isGHINVerified)}`,
  );
  logStep(
    `[Secondary] Profile updated; completion=${secondaryPct}%; photos=${secondaryPhotos}; isGHINVerified=${Boolean(secondaryProfile.isGHINVerified)}`,
  );
  if (primaryPhotos < 1 || secondaryPhotos < 1) {
    logStep(
      '[Photos] No profile photo via script (by design). Photo is NOT required for Connect discovery. ' +
        'Manual upload via normal app flow recommended for a more complete Connect card.',
    );
  }

  await grantPremiumOverride(apiBase, adminTokens.accessToken, primary.me.id, 'Primary');
  await grantPremiumOverride(apiBase, adminTokens.accessToken, secondary.me.id, 'Secondary');

  // Refresh profile premium flags after override
  const primaryAfterPremium = await api<ProfileMe>(apiBase, '/profiles/me', {
    token: primary.tokens.accessToken,
  });
  const secondaryAfterPremium = await api<ProfileMe>(apiBase, '/profiles/me', {
    token: secondary.tokens.accessToken,
  });
  logStep(`[Primary] isPremium=${Boolean(primaryAfterPremium.isPremium)}`);
  logStep(`[Secondary] isPremium=${Boolean(secondaryAfterPremium.isPremium)}`);
  if (!primaryAfterPremium.isPremium || !secondaryAfterPremium.isPremium) {
    throw new Error('Effective Premium not reflected on profile after admin override');
  }

  await ensureMutualMatch(
    apiBase,
    primary.tokens.accessToken,
    secondary.tokens.accessToken,
    primary.me.id,
    secondary.me.id,
  );

  await ensureConversationAndMessage(
    apiBase,
    primary.tokens.accessToken,
    secondary.me.id,
  );

  const feed = await ensureFeedPost(
    apiBase,
    primary.tokens.accessToken,
    secondary.tokens.accessToken,
    secondary.me.id,
  );
  if (!feed.visibleToPrimary) {
    throw new Error('Feed post not visible to primary under normal Feed rules');
  }

  await verifyLogins(apiBase, primaryEmail, primaryPassword, secondaryEmail, secondaryPassword);

  logStep('--- Summary ---');
  logStep(`Primary account: ${primary.created ? 'CREATED' : 'REUSED'} (${primaryEmail} / ${PRIMARY.username})`);
  logStep(`Secondary account: ${secondary.created ? 'CREATED' : 'REUSED'} (${secondaryEmail} / ${SECONDARY.username})`);
  logStep(`Location: ${REVIEW_LOCATION.city}, ${REVIEW_LOCATION.state} (city-level public coords)`);
  logStep(`Profile completion: primary=${primaryPct}% secondary=${secondaryPct}%`);
  logStep('Premium: admin override (no expiry) on BOTH accounts');
  logStep('Match / chat / feed: ensured via normal APIs');
  logStep('DONE — no passwords or tokens printed.');
}

main().catch((err) => {
  logFail(`FATAL: ${(err as Error).message}`);
  process.exit(1);
});
