/**
 * Demo data aligned with Golf/Figma static mocks (Unsplash portraits, SF Bay golfers).
 * Run: npx prisma db seed   (or npm run prisma:seed)
 *
 * Login (primary account): john@demo.connectghin.com / Password123!
 */
import {
  AdminActionType,
  BillingCycle,
  MembershipStatus,
  MembershipType,
  PlayerRatingStatus,
  Prisma,
  ReportStatus,
  SubscriptionProvider,
  SubscriptionStatus,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_DOMAIN = 'demo.connectghin.com';
const DEMO_PASSWORD = 'Password123!';

const IMAGES = {
  sarah:
    'https://images.unsplash.com/photo-1672936830498-3e07f1ed3c02?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  michael:
    'https://images.unsplash.com/photo-1662954610383-64450aa24b82?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  emma:
    'https://images.unsplash.com/photo-1686605972745-619c86a6d1f2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  david:
    'https://images.unsplash.com/photo-1693163487498-07bbd30067f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  john: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
};

async function wipeDemoUsers(): Promise<void> {
  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
  });
}

async function main(): Promise<void> {
  const hash = await argon2.hash(DEMO_PASSWORD);

  await prisma.appSettings.upsert({
    where: { key: 'premium_direct_message_enabled' },
    create: { key: 'premium_direct_message_enabled', valueJson: false },
    update: { valueJson: false },
  });
  await prisma.appSettings.upsert({
    where: { key: 'admin_brand_name' },
    create: { key: 'admin_brand_name', valueJson: 'ConnectGHIN' },
    update: { valueJson: 'ConnectGHIN' },
  });

  await wipeDemoUsers();

  await prisma.user.create({
    data: {
      email: `admin@${DEMO_DOMAIN}`,
      username: 'admin_connectghin',
      role: UserRole.ADMIN,
      passwordHash: hash,
      profile: {
        create: {
          displayName: 'Admin',
          profileCompletionPercent: 20,
        },
      },
      privacySettings: { create: {} },
      userSettings: { create: {} },
    },
  });

  const john = await prisma.user.create({
    data: {
      email: `john@${DEMO_DOMAIN}`,
      username: 'john_smith',
      passwordHash: hash,
      profile: {
        create: {
          displayName: 'John Smith',
          age: 30,
          city: 'San Francisco',
          state: 'CA',
          country: 'USA',
          locationLat: new Prisma.Decimal('37.7749'),
          locationLng: new Prisma.Decimal('-122.4194'),
          handicap: new Prisma.Decimal('12.5'),
          homeCourse: 'Harding Park',
          bio: 'Passionate golfer who loves early morning rounds and meeting new playing partners. Always looking to improve my game!',
          lookingFor: 'Moderate pace, friendly competition',
          drinkingPreference: 'Social',
          smokingPreference: 'No',
          musicPreference: 'Quiet',
          profileCompletionPercent: 80,
          isGHINVerified: false,
        },
      },
      privacySettings: { create: {} },
      userSettings: { create: {} },
      profilePhotos: {
        create: [{ imageUrl: IMAGES.john, sortOrder: 0, isPrimary: true }],
      },
    },
  });

  const sarah = await prisma.user.create({
    data: {
      email: `sarah@${DEMO_DOMAIN}`,
      username: 'sarah_martinez',
      passwordHash: hash,
      membershipType: MembershipType.PREMIUM,
      membershipStatus: MembershipStatus.ACTIVE,
      profile: {
        create: {
          displayName: 'Sarah Martinez',
          age: 28,
          city: 'San Francisco',
          state: 'CA',
          country: 'USA',
          locationLat: new Prisma.Decimal('37.7849'),
          locationLng: new Prisma.Decimal('-122.4094'),
          handicap: new Prisma.Decimal('14.2'),
          homeCourse: 'Harding Park',
          bio: 'Love playing early morning rounds. Looking for partners who enjoy a relaxed pace.',
          lookingFor: 'Relaxed pace',
          drinkingPreference: 'Social',
          smokingPreference: 'No',
          musicPreference: 'Music OK',
          profileCompletionPercent: 100,
          isGHINVerified: true,
        },
      },
      privacySettings: { create: {} },
      userSettings: { create: {} },
      profilePhotos: {
        create: [{ imageUrl: IMAGES.sarah, sortOrder: 0, isPrimary: true }],
      },
    },
  });

  const michael = await prisma.user.create({
    data: {
      email: `michael@${DEMO_DOMAIN}`,
      username: 'michael_chen',
      passwordHash: hash,
      membershipType: MembershipType.PREMIUM,
      membershipStatus: MembershipStatus.ACTIVE,
      profile: {
        create: {
          displayName: 'Michael Chen',
          age: 32,
          city: 'Oakland',
          state: 'CA',
          country: 'USA',
          handicap: new Prisma.Decimal('8.5'),
          homeCourse: 'Pebble Beach',
          bio: 'Competitive player, always looking to improve. Weekend warrior at Pebble Beach.',
          lookingFor: 'Fast pace',
          drinkingPreference: 'Occasionally',
          smokingPreference: 'No',
          musicPreference: 'Quiet rounds',
          profileCompletionPercent: 100,
          isGHINVerified: true,
        },
      },
      privacySettings: { create: {} },
      userSettings: { create: {} },
      profilePhotos: {
        create: [{ imageUrl: IMAGES.michael, sortOrder: 0, isPrimary: true }],
      },
    },
  });

  const emma = await prisma.user.create({
    data: {
      email: `emma@${DEMO_DOMAIN}`,
      username: 'emma_wilson',
      passwordHash: hash,
      profile: {
        create: {
          displayName: 'Emma Wilson',
          age: 26,
          city: 'Berkeley',
          state: 'CA',
          country: 'USA',
          handicap: new Prisma.Decimal('19.8'),
          homeCourse: 'Tilden Park',
          bio: 'Beginner golfer excited to learn and improve with patient partners!',
          lookingFor: 'Relaxed pace',
          drinkingPreference: 'No',
          smokingPreference: 'No',
          musicPreference: 'Quiet',
          profileCompletionPercent: 90,
          isGHINVerified: false,
        },
      },
      privacySettings: { create: {} },
      userSettings: { create: {} },
      profilePhotos: {
        create: [{ imageUrl: IMAGES.emma, sortOrder: 0, isPrimary: true }],
      },
    },
  });

  const david = await prisma.user.create({
    data: {
      email: `david@${DEMO_DOMAIN}`,
      username: 'david_park',
      passwordHash: hash,
      profile: {
        create: {
          displayName: 'David Park',
          age: 35,
          city: 'San Mateo',
          state: 'CA',
          country: 'USA',
          handicap: new Prisma.Decimal('11.3'),
          homeCourse: 'Crystal Springs',
          bio: 'Golf is my meditation. Play 3-4 times a week, always looking for new courses.',
          lookingFor: 'Moderate pace',
          drinkingPreference: 'Social',
          smokingPreference: 'No',
          musicPreference: 'Flexible',
          profileCompletionPercent: 100,
          isGHINVerified: true,
        },
      },
      privacySettings: { create: {} },
      userSettings: { create: {} },
      profilePhotos: {
        create: [{ imageUrl: IMAGES.david, sortOrder: 0, isPrimary: true }],
      },
    },
  });

  await prisma.swipe.createMany({
    data: [
      { fromUserId: john.id, toUserId: sarah.id, action: 'LIKE' },
      { fromUserId: sarah.id, toUserId: john.id, action: 'LIKE' },
    ],
  });

  const [u1, u2] = [john.id, sarah.id].sort();
  const match = await prisma.match.create({
    data: { userOneId: u1, userTwoId: u2 },
  });

  const conv = await prisma.conversation.create({
    data: {
      participants: {
        createMany: { data: [{ userId: john.id }, { userId: sarah.id }] },
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        conversationId: conv.id,
        senderId: sarah.id,
        body: 'Hey! Love your profile. Would you like to play a round sometime?',
      },
      {
        conversationId: conv.id,
        senderId: john.id,
        body: "Thanks! That would be great! What's your home course?",
      },
      {
        conversationId: conv.id,
        senderId: sarah.id,
        body: 'I usually play at Harding Park. How about you?',
      },
      {
        conversationId: conv.id,
        senderId: john.id,
        body: "Nice! I'm at Presidio Golf Course most weekends. Want to try Harding this Saturday?",
      },
      {
        conversationId: conv.id,
        senderId: sarah.id,
        body: 'That sounds great! What time works for you?',
      },
    ],
  });

  await prisma.notification.create({
    data: {
      userId: john.id,
      type: 'NEW_MATCH',
      title: 'New match',
      body: 'You matched with sarah_martinez',
      dataJson: { matchedUserId: sarah.id, matchId: match.id },
    },
  });

  // Admin-focused demo data for the Next.js admin panel.
  await prisma.gHINVerificationRequest.createMany({
    data: [
      {
        userId: emma.id,
        ghinNumber: 'GHIN-901122',
        handicapSnapshot: new Prisma.Decimal('19.8'),
        status: VerificationStatus.PENDING,
      },
      {
        userId: john.id,
        ghinNumber: 'GHIN-112233',
        handicapSnapshot: new Prisma.Decimal('12.5'),
        status: VerificationStatus.REJECTED,
        rejectionReason: 'Screenshot did not clearly show full GHIN profile.',
      },
      {
        userId: david.id,
        ghinNumber: 'GHIN-445566',
        handicapSnapshot: new Prisma.Decimal('11.3'),
        status: VerificationStatus.VERIFIED,
      },
    ],
  });

  await prisma.subscription.createMany({
    data: [
      {
        userId: sarah.id,
        provider: SubscriptionProvider.APPLE_APP_STORE,
        planCode: 'connectghin.premium.monthly',
        storeProductId: 'connectghin.premium.monthly',
        storeExternalId: `demo_apple_tx_${sarah.id.slice(0, 8)}`,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        amount: 1999,
        currency: 'USD',
      },
      {
        userId: michael.id,
        provider: SubscriptionProvider.GOOGLE_PLAY,
        planCode: 'connectghin.premium.yearly',
        storeProductId: 'connectghin.premium.yearly',
        storeExternalId: `demo_google_token_${michael.id.slice(0, 8)}`,
        billingCycle: BillingCycle.YEARLY,
        status: SubscriptionStatus.TRIALING,
        amount: 14999,
        currency: 'USD',
      },
      {
        userId: john.id,
        provider: SubscriptionProvider.APPLE_APP_STORE,
        planCode: 'connectghin.premium.monthly',
        storeProductId: 'connectghin.premium.monthly',
        storeExternalId: `demo_apple_tx_${john.id.slice(0, 8)}`,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.PAST_DUE,
        amount: 1999,
        currency: 'USD',
      },
    ],
  });

  await prisma.report.createMany({
    data: [
      {
        reportedByUserId: emma.id,
        targetUserId: david.id,
        reason: 'Harassment in chat',
        details: 'Repeated aggressive messages after I declined a round.',
        status: ReportStatus.OPEN,
      },
      {
        reportedByUserId: john.id,
        targetUserId: michael.id,
        reason: 'Fake GHIN information',
        details: 'Profile details appear inconsistent with GHIN listing.',
        status: ReportStatus.REVIEWED,
      },
      {
        reportedByUserId: sarah.id,
        targetUserId: john.id,
        reason: 'Inappropriate profile content',
        details: 'Bio contained off-topic content.',
        status: ReportStatus.RESOLVED,
      },
    ],
  });

  await prisma.playerRatingReview.createMany({
    data: [
      {
        reviewerUserId: john.id,
        revieweeUserId: sarah.id,
        roundDate: new Date('2026-05-05T00:00:00.000Z'),
        submittedAt: new Date('2026-05-07T00:00:00.000Z'),
        course: 'Pebble Beach',
        overallRating: 5,
        handicapAccuracy: 5,
        sportsmanship: 5,
        paceOfPlay: 4,
        wouldPlayAgain: true,
        comment: 'Great playing partner! Very respectful and played at a good pace.',
        status: PlayerRatingStatus.APPROVED,
      },
      {
        reviewerUserId: michael.id,
        revieweeUserId: john.id,
        roundDate: new Date('2026-05-03T00:00:00.000Z'),
        submittedAt: new Date('2026-05-05T00:00:00.000Z'),
        course: 'Pebble Beach Golf Links',
        overallRating: 1,
        handicapAccuracy: 1,
        sportsmanship: 2,
        paceOfPlay: 1,
        wouldPlayAgain: false,
        comment: 'Terrible experience. Very rude and plays way too slow. Does not match his stated handicap at all.',
        status: PlayerRatingStatus.FLAGGED,
        reportedReason: 'Potentially abusive language',
      },
      {
        reviewerUserId: david.id,
        revieweeUserId: emma.id,
        roundDate: new Date('2026-05-01T00:00:00.000Z'),
        submittedAt: new Date('2026-05-03T00:00:00.000Z'),
        course: 'Harding Park',
        overallRating: 4,
        handicapAccuracy: 4,
        sportsmanship: 5,
        paceOfPlay: 3,
        wouldPlayAgain: true,
        comment: 'Good round together. Friendly player and handicap seemed accurate.',
        status: PlayerRatingStatus.APPROVED,
      },
      {
        reviewerUserId: sarah.id,
        revieweeUserId: john.id,
        roundDate: new Date('2026-04-28T00:00:00.000Z'),
        submittedAt: new Date('2026-04-30T00:00:00.000Z'),
        course: 'TPC Harding Park',
        overallRating: 3,
        handicapAccuracy: 2,
        sportsmanship: 4,
        paceOfPlay: 3,
        wouldPlayAgain: true,
        comment: 'Decent round. Nice person, but handicap might be off by a few strokes.',
        status: PlayerRatingStatus.PENDING,
      },
    ],
  });

  await prisma.appSettings.upsert({
    where: { key: 'free_swipe_daily_limit' },
    create: { key: 'free_swipe_daily_limit', valueJson: 25 },
    update: { valueJson: 25 },
  });
  await prisma.appSettings.upsert({
    where: { key: 'trial_days' },
    create: { key: 'trial_days', valueJson: 7 },
    update: { valueJson: 7 },
  });
  await prisma.appSettings.upsert({
    where: { key: 'maintenance_mode' },
    create: { key: 'maintenance_mode', valueJson: false },
    update: { valueJson: false },
  });
  await prisma.appSettings.upsert({
    where: { key: 'support_contact_email' },
    create: { key: 'support_contact_email', valueJson: 'support@connectghin.com' },
    update: { valueJson: 'support@connectghin.com' },
  });
  await prisma.appSettings.upsert({
    where: { key: 'premium_unlimited_swipes_enabled' },
    create: { key: 'premium_unlimited_swipes_enabled', valueJson: true },
    update: { valueJson: true },
  });
  await prisma.appSettings.upsert({
    where: { key: 'verified_only_filter_enabled' },
    create: { key: 'verified_only_filter_enabled', valueJson: true },
    update: { valueJson: true },
  });
  await prisma.appSettings.upsert({
    where: { key: 'premium_monthly_price_usd' },
    create: { key: 'premium_monthly_price_usd', valueJson: 9.99 },
    update: { valueJson: 9.99 },
  });
  await prisma.appSettings.upsert({
    where: { key: 'premium_yearly_price_usd' },
    create: { key: 'premium_yearly_price_usd', valueJson: 99.99 },
    update: { valueJson: 99.99 },
  });
  await prisma.appSettings.upsert({
    where: { key: 'auto_review_threshold' },
    create: { key: 'auto_review_threshold', valueJson: 5 },
    update: { valueJson: 5 },
  });
  await prisma.appSettings.upsert({
    where: { key: 'public_support_contact' },
    create: { key: 'public_support_contact', valueJson: '' },
    update: { valueJson: '' },
  });

  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: `admin@${DEMO_DOMAIN}` },
    select: { id: true },
  });
  await prisma.adminAuditLog.createMany({
    data: [
      {
        adminUserId: adminUser.id,
        actionType: AdminActionType.ADMIN_LOGIN,
        metadataJson: { seeded: true },
      },
      {
        adminUserId: adminUser.id,
        actionType: AdminActionType.APP_SETTINGS_UPDATE,
        metadataJson: { key: 'free_swipe_daily_limit', value: 25 },
      },
      {
        adminUserId: adminUser.id,
        actionType: AdminActionType.REPORT_REVIEW,
        targetUserId: michael.id,
        metadataJson: { status: 'REVIEWED', source: 'seed' },
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.log(`
ConnectGHIN demo seed complete.

  Primary login:  john@${DEMO_DOMAIN}
  Password:       ${DEMO_PASSWORD}

  Other accounts (same password): admin, sarah, michael, emma, david @${DEMO_DOMAIN}
  Admin login: admin@${DEMO_DOMAIN}

  John ↔ Sarah: mutual match + conversation with sample messages.
  Admin demo data: GHIN requests, reports, subscriptions, app settings, audit logs.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
