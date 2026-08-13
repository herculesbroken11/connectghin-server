/**
 * Upserts support@connectghin.com with full demo golfer profile.
 * Run: node scripts/upsert-support-user.mjs
 */
import argon2 from 'argon2';
import {
  MembershipStatus,
  MembershipType,
  PrismaClient,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();

const EMAIL = 'support@connectghin.com';
const PASSWORD = 'qwer1234QWER!@#$';
const USERNAME = 'support_connectghin';
const PHOTO =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop';

const supportProfile = {
  displayName: 'Sam Rivera',
  age: 34,
  addressLine1: '100 Market St',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94105',
  country: 'USA',
  locationLat: '37.7936',
  locationLng: '-122.3965',
  handicap: '10.8',
  homeCourse: 'TPC Harding Park',
  bio: 'ConnectGHIN support test account. Friendly mid-handicap golfer who likes weekend foursomes and trying new Bay Area courses.',
  lookingFor: 'Playing partners, Fill a foursome, Friendly rounds',
  skillLevel: 'Intermediate',
  playFrequency: 'Weekends',
  drinkingPreference: 'Social',
  smokingPreference: 'No',
  musicPreference: 'Music OK',
  gender: 'Male',
  profileCompletionPercent: 100,
  isGHINVerified: true,
};

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);
  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });

  if (existing) {
    await prisma.profilePhoto.deleteMany({ where: { userId: existing.id } });
    await prisma.user.update({
      where: { email: EMAIL },
      data: {
        passwordHash,
        username: USERNAME,
        role: UserRole.USER,
        membershipType: MembershipType.PREMIUM,
        membershipStatus: MembershipStatus.ACTIVE,
        isEmailVerified: true,
        isActive: true,
        isSuspended: false,
        profile: {
          upsert: {
            create: supportProfile,
            update: supportProfile,
          },
        },
        privacySettings: { upsert: { create: {}, update: {} } },
        userSettings: { upsert: { create: {}, update: {} } },
        profilePhotos: {
          create: [{ imageUrl: PHOTO, sortOrder: 0, isPrimary: true }],
        },
      },
    });
    console.log(`Updated ${EMAIL} with full golfer profile`);
  } else {
    await prisma.user.create({
      data: {
        email: EMAIL,
        username: USERNAME,
        role: UserRole.USER,
        membershipType: MembershipType.PREMIUM,
        membershipStatus: MembershipStatus.ACTIVE,
        passwordHash,
        isEmailVerified: true,
        profile: { create: supportProfile },
        privacySettings: { create: {} },
        userSettings: { create: {} },
        profilePhotos: {
          create: [{ imageUrl: PHOTO, sortOrder: 0, isPrimary: true }],
        },
      },
    });
    console.log(`Created ${EMAIL} with full golfer profile`);
  }

  console.log(`
Login:
  Email:    ${EMAIL}
  Password: ${PASSWORD}
  Name:     Sam Rivera
  HCP:      10.8 (verified)
  City:     San Francisco, CA
  Plan:     Premium
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
