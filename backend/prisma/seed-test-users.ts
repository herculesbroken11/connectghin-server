/**
 * Seeds 50 diverse US golfer profiles for discovery / purchase-flow testing.
 * Run: npm run prisma:seed-test-users
 *
 * All accounts: {username}@test.connectghin.com / Password123!
 * Re-running removes prior @test.connectghin.com users first.
 */
import { MembershipStatus, MembershipType, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_DOMAIN = 'test.connectghin.com';
const TEST_PASSWORD = 'Password123!';

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Professional'] as const;
const PLAY_FREQUENCIES = [
  'Multiple times per week',
  'Weekly',
  'Monthly',
  'A few times a year',
  'Rarely',
] as const;
const PACE_OPTIONS = ['Relaxed', 'Moderate', 'Fast'] as const;
const COMPETITION_OPTIONS = ['Casual', 'Friendly', 'Competitive'] as const;
const DRINKING_OPTIONS = ['Yes', 'Sometimes', 'No', 'Prefer not to say'] as const;
const SMOKING_OPTIONS = ['Yes', 'Sometimes', 'No', 'Prefer not to say'] as const;
const MUSIC_OPTIONS = ['Love it on the course', 'Sometimes', 'Prefer quiet golf'] as const;
const GENDERS = ['Woman', 'Man', 'Non-binary', 'Prefer not to say'] as const;
const SEEKING = [
  'casual round',
  'competitive round',
  'networking',
  'practice partner',
  'fill a foursome',
  'tournament prep',
] as const;
const TEE_TIMES = [
  'weekday mornings',
  'weekend mornings',
  'Saturday afternoons',
  'Sunday twilight',
  'Friday early bird',
  'weekday after work',
] as const;

/** Portrait placeholders — cycles through Unsplash golf/lifestyle portraits. */
const PHOTO_POOL = [
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1672936830498-3e07f1ed3c02?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  'https://images.unsplash.com/photo-1662954610383-64450aa24b82?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  'https://images.unsplash.com/photo-1686605972745-619c86a6d1f2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  'https://images.unsplash.com/photo-1693163487498-07bbd30067f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=400&h=400&fit=crop',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop',
];

type CitySeed = {
  city: string;
  state: string;
  lat: string;
  lng: string;
  homeCourses: string[];
};

const US_CITIES: CitySeed[] = [
  { city: 'Austin', state: 'TX', lat: '30.2672', lng: '-97.7431', homeCourses: ['Barton Creek Resort', 'Lions Municipal Golf Course'] },
  { city: 'Phoenix', state: 'AZ', lat: '33.4484', lng: '-112.0740', homeCourses: ['TPC Scottsdale', 'Grayhawk Golf Club'] },
  { city: 'Scottsdale', state: 'AZ', lat: '33.4942', lng: '-111.9261', homeCourses: ['TPC Scottsdale', 'Talking Stick Golf Club'] },
  { city: 'Denver', state: 'CO', lat: '39.7392', lng: '-104.9903', homeCourses: ['City Park Golf Course', 'Arrowhead Golf Club'] },
  { city: 'Seattle', state: 'WA', lat: '47.6062', lng: '-122.3321', homeCourses: ['West Seattle Golf Course', 'Chambers Bay'] },
  { city: 'Miami', state: 'FL', lat: '25.7617', lng: '-80.1918', homeCourses: ['Crandon Golf at Key Biscayne', 'Trump National Doral'] },
  { city: 'Atlanta', state: 'GA', lat: '33.7490', lng: '-84.3880', homeCourses: ['East Lake Golf Club', 'Piedmont Driving Club'] },
  { city: 'Chicago', state: 'IL', lat: '41.8781', lng: '-87.6298', homeCourses: ['Cog Hill Golf Club', 'Medinah Country Club'] },
  { city: 'Boston', state: 'MA', lat: '42.3601', lng: '-71.0589', homeCourses: ['The Country Club', 'George Wright Golf Course'] },
  { city: 'Nashville', state: 'TN', lat: '36.1627', lng: '-86.7816', homeCourses: ['Gaylord Springs Golf Links', 'Hermitage Golf Course'] },
  { city: 'Portland', state: 'OR', lat: '45.5152', lng: '-122.6784', homeCourses: ['Pumpkin Ridge Golf Club', 'Heron Lakes Golf Course'] },
  { city: 'Dallas', state: 'TX', lat: '32.7767', lng: '-96.7970', homeCourses: ['TPC Craig Ranch', 'Tenison Park Golf Course'] },
  { city: 'Charlotte', state: 'NC', lat: '35.2271', lng: '-80.8431', homeCourses: ['Quail Hollow Club', 'Ballantyne Country Club'] },
  { city: 'San Diego', state: 'CA', lat: '32.7157', lng: '-117.1611', homeCourses: ['Torrey Pines Golf Course', 'Balboa Park Golf Course'] },
  { city: 'Minneapolis', state: 'MN', lat: '44.9778', lng: '-93.2650', homeCourses: ['The Minikahda Club', 'Columbia Golf Course'] },
  { city: 'Tampa', state: 'FL', lat: '27.9506', lng: '-82.4572', homeCourses: ['TPC Tampa Bay', 'Palma Ceia Golf & Country Club'] },
  { city: 'Las Vegas', state: 'NV', lat: '36.1699', lng: '-115.1398', homeCourses: ['Shadow Creek', 'TPC Las Vegas'] },
  { city: 'Hilton Head', state: 'SC', lat: '32.2163', lng: '-80.7526', homeCourses: ['Harbour Town Golf Links', 'Palmetto Dunes Oceanfront Resort'] },
  { city: 'Palm Springs', state: 'CA', lat: '33.8303', lng: '-116.5453', homeCourses: ['PGA West', 'Indian Wells Golf Resort'] },
  { city: 'San Francisco', state: 'CA', lat: '37.7749', lng: '-122.4194', homeCourses: ['TPC Harding Park', 'Presidio Golf Course'] },
  { city: 'Los Angeles', state: 'CA', lat: '34.0522', lng: '-118.2437', homeCourses: ['Riviera Country Club', 'Wilson Golf Course'] },
  { city: 'Houston', state: 'TX', lat: '29.7604', lng: '-95.3698', homeCourses: ['Memorial Park Golf Course', 'Wildcat Golf Club'] },
  { city: 'Philadelphia', state: 'PA', lat: '39.9526', lng: '-75.1652', homeCourses: ['Aronimink Golf Club', 'Philadelphia Cricket Club'] },
  { city: 'Detroit', state: 'MI', lat: '42.3314', lng: '-83.0458', homeCourses: ['Detroit Golf Club', 'Rackham Golf Course'] },
  { city: 'Salt Lake City', state: 'UT', lat: '40.7608', lng: '-111.8910', homeCourses: ['Wasatch Mountain State Park', 'Mountain Dell Golf Course'] },
];

const FIRST_NAMES = [
  'James', 'Maria', 'Robert', 'Jennifer', 'Michael', 'Linda', 'David', 'Patricia', 'William', 'Elizabeth',
  'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Lisa',
  'Matthew', 'Nancy', 'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Steven', 'Ashley',
  'Andrew', 'Kimberly', 'Paul', 'Emily', 'Joshua', 'Donna', 'Kenneth', 'Michelle', 'Kevin', 'Carol',
  'Brian', 'Amanda', 'George', 'Melissa', 'Timothy', 'Deborah', 'Ronald', 'Stephanie', 'Jason', 'Rebecca',
];

const LAST_NAMES = [
  'Anderson', 'Martinez', 'Thompson', 'Garcia', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker',
  'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson',
  'Hill', 'Ramirez', 'Campbell', 'Mitchell', 'Roberts', 'Carter', 'Phillips', 'Evans', 'Turner', 'Torres',
  'Parker', 'Collins', 'Edwards', 'Stewart', 'Flores', 'Morris', 'Nguyen', 'Murphy', 'Rivera', 'Cook',
  'Rogers', 'Morgan', 'Peterson', 'Cooper', 'Reed', 'Bailey', 'Bell', 'Gomez', 'Kelly', 'Howard',
];

const BIOS = [
  'Weekend golfer who loves meeting new people on the course. Always up for a post-round coffee.',
  'Serious about improving my handicap but I never take the game too seriously off the tee.',
  'Relaxed player looking for fun rounds and good conversation between shots.',
  'Competitive in friendly scrambles — love tournament-style play when the stakes are bragging rights only.',
  'New to the area and hoping to find a regular Saturday morning group.',
  'Business golfer who enjoys networking on the course as much as the golf itself.',
  'Patient teacher type — happy to play with beginners and share what I have learned.',
  'Fast walker, ready golfer. Looking for partners who keep pace without rushing the group.',
  'Course collector — always chasing my next favorite public track within a few hours drive.',
  'Twilight golf enthusiast. Nothing beats nine holes after a long work week.',
];

function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildLookingFor(pace: string, competition: string, seeking: string): string {
  return `Pace: ${pace}; Competition: ${competition}; Also seeking: ${seeking}`;
}

function buildBio(base: string, teeTime: string, personality: string): string {
  return `${base} Prefers ${teeTime}. ${personality}`;
}

function computeCompletion(hasSecondPhoto: boolean): number {
  // Mirrors profiles.service computeProfileCompletionPercent for a fully filled profile.
  let s = 5 + 5 + 10 + 8 + 4 + 6 + 6 + 6 + 6 + 6 + 10 + 4 + 4 + 4 + 8;
  if (hasSecondPhoto) s += 8;
  return Math.min(100, s);
}

async function wipeTestUsers(): Promise<void> {
  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${TEST_DOMAIN}` } },
  });
}

async function main(): Promise<void> {
  const hash = await argon2.hash(TEST_PASSWORD);
  await wipeTestUsers();

  const personalities = [
    'Social and upbeat on the course.',
    'Quiet focus, friendly between holes.',
    'Beginner mindset, eager to learn.',
    'Serious golfer, respectful of etiquette.',
    'Laid-back pace, no pressure golf.',
  ];

  for (let i = 0; i < 50; i++) {
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i * 3 + 7);
    const displayName = `${first} ${last}`;
    const username = slugify(`${first}_${last}_${i + 1}`);
    const email = `${username}@${TEST_DOMAIN}`;
    const location = pick(US_CITIES, i);
    const age = 24 + (i % 37);
    const handicap = new Prisma.Decimal((2 + (i * 0.7) % 28).toFixed(1));
    const pace = pick(PACE_OPTIONS, i);
    const competition = pick(COMPETITION_OPTIONS, i + 2);
    const seeking = pick(SEEKING, i + 1);
    const teeTime = pick(TEE_TIMES, i);
    const skillLevel = pick(SKILL_LEVELS, i);
    const playFrequency = pick(PLAY_FREQUENCIES, i);
    const gender = pick(GENDERS, i);
    const isPremium = i % 5 === 0;
    const isVerified = i % 4 === 0;
    const photoUrl = pick(PHOTO_POOL, i);
    const homeCourse = pick(location.homeCourses, i);

    const jitterLat = (parseFloat(location.lat) + ((i % 7) - 3) * 0.02).toFixed(4);
    const jitterLng = (parseFloat(location.lng) + ((i % 5) - 2) * 0.02).toFixed(4);

    await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hash,
        isEmailVerified: true,
        membershipType: isPremium ? MembershipType.PREMIUM : MembershipType.FREE,
        membershipStatus: isPremium ? MembershipStatus.ACTIVE : MembershipStatus.NONE,
        profile: {
          create: {
            displayName,
            bio: buildBio(pick(BIOS, i), teeTime, pick(personalities, i)),
            age,
            city: location.city,
            state: location.state,
            country: 'USA',
            locationLat: new Prisma.Decimal(jitterLat),
            locationLng: new Prisma.Decimal(jitterLng),
            handicap,
            homeCourse,
            lookingFor: buildLookingFor(pace, competition, seeking),
            skillLevel,
            playFrequency,
            gender,
            drinkingPreference: pick(DRINKING_OPTIONS, i),
            smokingPreference: pick(SMOKING_OPTIONS, i + 1),
            musicPreference: pick(MUSIC_OPTIONS, i + 2),
            profileCompletionPercent: computeCompletion(i % 3 === 0),
            isGHINVerified: isVerified,
          },
        },
        privacySettings: {
          create: {
            showInDiscovery: true,
            showDistance: true,
          },
        },
        userSettings: { create: {} },
        profilePhotos: {
          create: [
            { imageUrl: photoUrl, sortOrder: 0, isPrimary: true },
            ...(i % 3 === 0
              ? [{ imageUrl: pick(PHOTO_POOL, i + 5), sortOrder: 1, isPrimary: false }]
              : []),
          ],
        },
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`
ConnectGHIN test users seed complete.

  Created: 50 golfers @${TEST_DOMAIN}
  Password (all): ${TEST_PASSWORD}

  Example logins:
    james_anderson_1@${TEST_DOMAIN}
    maria_martinez_2@${TEST_DOMAIN}

  Mix: FREE + PREMIUM, varied US cities, onboarding-aligned field values.
  Re-run safe: wipes @${TEST_DOMAIN} users first.
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
