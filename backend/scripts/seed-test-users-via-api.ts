/**
 * Seeds 50 test golfers via the public API (no direct DB access needed).
 * Run: npm run seed:test-users:api
 *
 * Default target: https://api.connectghin.com/api/v1
 * Override: API_BASE_URL=http://localhost:3001/api/v1 npm run seed:test-users:api
 */
const API_BASE = (process.env.API_BASE_URL ?? 'https://api.connectghin.com/api/v1').replace(/\/$/, '');
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
];

type CitySeed = { city: string; state: string; lat: number; lng: number; homeCourses: string[] };

const US_CITIES: CitySeed[] = [
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431, homeCourses: ['Barton Creek Resort', 'Lions Municipal Golf Course'] },
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.074, homeCourses: ['TPC Scottsdale', 'Grayhawk Golf Club'] },
  { city: 'Scottsdale', state: 'AZ', lat: 33.4942, lng: -111.9261, homeCourses: ['TPC Scottsdale', 'Talking Stick Golf Club'] },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903, homeCourses: ['City Park Golf Course', 'Arrowhead Golf Club'] },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321, homeCourses: ['West Seattle Golf Course', 'Chambers Bay'] },
  { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918, homeCourses: ['Crandon Golf at Key Biscayne', 'Trump National Doral'] },
  { city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388, homeCourses: ['East Lake Golf Club', 'Piedmont Driving Club'] },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298, homeCourses: ['Cog Hill Golf Club', 'Medinah Country Club'] },
  { city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589, homeCourses: ['The Country Club', 'George Wright Golf Course'] },
  { city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816, homeCourses: ['Gaylord Springs Golf Links', 'Hermitage Golf Course'] },
  { city: 'Portland', state: 'OR', lat: 45.5152, lng: -122.6784, homeCourses: ['Pumpkin Ridge Golf Club', 'Heron Lakes Golf Course'] },
  { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797, homeCourses: ['TPC Craig Ranch', 'Tenison Park Golf Course'] },
  { city: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431, homeCourses: ['Quail Hollow Club', 'Ballantyne Country Club'] },
  { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611, homeCourses: ['Torrey Pines Golf Course', 'Balboa Park Golf Course'] },
  { city: 'Minneapolis', state: 'MN', lat: 44.9778, lng: -93.265, homeCourses: ['The Minikahda Club', 'Columbia Golf Course'] },
  { city: 'Tampa', state: 'FL', lat: 27.9506, lng: -82.4572, homeCourses: ['TPC Tampa Bay', 'Palma Ceia Golf & Country Club'] },
  { city: 'Las Vegas', state: 'NV', lat: 36.1699, lng: -115.1398, homeCourses: ['Shadow Creek', 'TPC Las Vegas'] },
  { city: 'Hilton Head', state: 'SC', lat: 32.2163, lng: -80.7526, homeCourses: ['Harbour Town Golf Links', 'Palmetto Dunes Oceanfront Resort'] },
  { city: 'Palm Springs', state: 'CA', lat: 33.8303, lng: -116.5453, homeCourses: ['PGA West', 'Indian Wells Golf Resort'] },
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194, homeCourses: ['TPC Harding Park', 'Presidio Golf Course'] },
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437, homeCourses: ['Riviera Country Club', 'Wilson Golf Course'] },
  { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698, homeCourses: ['Memorial Park Golf Course', 'Wildcat Golf Club'] },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652, homeCourses: ['Aronimink Golf Club', 'Philadelphia Cricket Club'] },
  { city: 'Detroit', state: 'MI', lat: 42.3314, lng: -83.0458, homeCourses: ['Detroit Golf Club', 'Rackham Golf Course'] },
  { city: 'Salt Lake City', state: 'UT', lat: 40.7608, lng: -111.891, homeCourses: ['Wasatch Mountain State Park', 'Mountain Dell Golf Course'] },
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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? JSON.stringify((body as { message: unknown }).message)
        : text;
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${msg}`);
  }
  return body as T;
}

async function getAccessToken(email: string, username: string): Promise<string> {
  try {
    const reg = await api<{ accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password: TEST_PASSWORD }),
    });
    return reg.accessToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('already in use')) throw err;
    const login = await api<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });
    return login.accessToken;
  }
}

async function seedUser(index: number): Promise<void> {
  const first = pick(FIRST_NAMES, index);
  const last = pick(LAST_NAMES, index * 3 + 7);
  const displayName = `${first} ${last}`;
  const username = slugify(`${first}_${last}_${index + 1}`);
  const email = `${username}@${TEST_DOMAIN}`;
  const location = pick(US_CITIES, index);
  const age = 24 + (index % 37);
  const handicap = Number((2 + (index * 0.7) % 28).toFixed(1));
  const pace = pick(PACE_OPTIONS, index);
  const competition = pick(COMPETITION_OPTIONS, index + 2);
  const seeking = pick(SEEKING, index + 1);
  const teeTime = pick(TEE_TIMES, index);
  const bio = `${pick(BIOS, index)} Prefers ${teeTime}. Social and upbeat on the course.`;
  const lat = location.lat + ((index % 7) - 3) * 0.02;
  const lng = location.lng + ((index % 5) - 2) * 0.02;

  const token = await getAccessToken(email, username);

  await api('/profiles/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      displayName,
      bio,
      age,
      city: location.city,
      state: location.state,
      country: 'USA',
      locationLat: lat,
      locationLng: lng,
      handicap,
      homeCourse: pick(location.homeCourses, index),
      lookingFor: `Pace: ${pace}; Competition: ${competition}; Also seeking: ${seeking}`,
      skillLevel: pick(SKILL_LEVELS, index),
      playFrequency: pick(PLAY_FREQUENCIES, index),
      gender: pick(GENDERS, index),
      drinkingPreference: pick(DRINKING_OPTIONS, index),
      smokingPreference: pick(SMOKING_OPTIONS, index + 1),
      musicPreference: pick(MUSIC_OPTIONS, index + 2),
    }),
  });

  await api('/profiles/me/photos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ imageUrl: pick(PHOTO_POOL, index) }),
  });

  // eslint-disable-next-line no-console
  console.log(`  [${index + 1}/50] ${displayName} <${email}>`);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Seeding 50 test users via ${API_BASE}\n`);

  for (let i = 0; i < 50; i++) {
    await seedUser(i);
  }

  // eslint-disable-next-line no-console
  console.log(`
Done. All accounts use password: ${TEST_PASSWORD}
Example: james_anderson_1@${TEST_DOMAIN}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
