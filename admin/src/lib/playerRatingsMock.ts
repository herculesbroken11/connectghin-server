export type RatingStatus = 'approved' | 'flagged' | 'pending' | 'removed';

export type PlayerRatingEntry = {
  id: string;
  profileId: string;
  reviewerName: string;
  reviewerHandle: string;
  reviewerId: string;
  revieweeName: string;
  revieweeHandle: string;
  revieweeId: string;
  roundDate: string;
  submittedDate: string;
  course: string;
  overallRating: number;
  handicapAccuracy: number;
  sportsmanship: number;
  pace: number;
  wouldPlayAgain: boolean;
  comment: string;
  status: RatingStatus;
  reportedReason?: string;
};

export type PlayerRatingProfile = {
  id: string;
  name: string;
  hcp: string;
  ghin: string;
  membership: 'Free' | 'Premium';
  averageRating: number;
  totalRatings: number;
  trend: 'up' | 'down' | 'flat';
  handicapAccuracyAvg: number;
  sportsmanshipAvg: number;
  paceAvg: number;
  wouldPlayAgainPct: number;
};

export const playerRatingProfiles: PlayerRatingProfile[] = [
  {
    id: 'usr_002',
    name: 'Tom Williams',
    hcp: '16.3',
    ghin: 'GHIN',
    membership: 'Free',
    averageRating: 3.2,
    totalRatings: 8,
    trend: 'down',
    handicapAccuracyAvg: 2.8,
    sportsmanshipAvg: 3.4,
    paceAvg: 3.5,
    wouldPlayAgainPct: 62,
  },
];

export const playerRatingEntries: PlayerRatingEntry[] = [
  {
    id: 'pr_001',
    profileId: 'usr_002',
    reviewerName: 'John Smith',
    reviewerHandle: 'usr_001',
    reviewerId: 'usr_001',
    revieweeName: 'Sarah Martinez',
    revieweeHandle: 'usr_002',
    revieweeId: 'usr_002',
    roundDate: '2026-05-05',
    submittedDate: '2026-05-07',
    course: 'Pebble Beach',
    overallRating: 5,
    handicapAccuracy: 5,
    sportsmanship: 5,
    pace: 4,
    wouldPlayAgain: true,
    comment: 'Great playing partner! Very respectful and played at a good pace.',
    status: 'approved',
  },
  {
    id: 'pr_002',
    profileId: 'usr_002',
    reviewerName: 'Mike Johnson',
    reviewerHandle: 'usr_004',
    reviewerId: 'usr_004',
    revieweeName: 'Tom Williams',
    revieweeHandle: 'usr_002',
    revieweeId: 'usr_002',
    roundDate: '2026-05-03',
    submittedDate: '2026-05-05',
    course: 'Pebble Beach Golf Links',
    overallRating: 1,
    handicapAccuracy: 1,
    sportsmanship: 2,
    pace: 1,
    wouldPlayAgain: false,
    comment: 'Terrible experience. Very rude and plays way too slow. Does not match his stated handicap at all.',
    status: 'flagged',
    reportedReason: 'Potentially abusive language',
  },
  {
    id: 'pr_003',
    profileId: 'usr_002',
    reviewerName: 'David Chen',
    reviewerHandle: 'usr_005',
    reviewerId: 'usr_005',
    revieweeName: 'Emma Wilson',
    revieweeHandle: 'usr_006',
    revieweeId: 'usr_006',
    roundDate: '2026-05-01',
    submittedDate: '2026-05-03',
    course: 'Harding Park',
    overallRating: 4,
    handicapAccuracy: 4,
    sportsmanship: 5,
    pace: 3,
    wouldPlayAgain: true,
    comment: 'Good round together. Friendly player and handicap seemed accurate.',
    status: 'approved',
  },
  {
    id: 'pr_004',
    profileId: 'usr_002',
    reviewerName: 'Sarah Martinez',
    reviewerHandle: 'usr_006',
    reviewerId: 'usr_006',
    revieweeName: 'Tom Williams',
    revieweeHandle: 'usr_002',
    revieweeId: 'usr_002',
    roundDate: '2026-04-28',
    submittedDate: '2026-04-30',
    course: 'TPC Harding Park',
    overallRating: 3,
    handicapAccuracy: 2,
    sportsmanship: 4,
    pace: 3,
    wouldPlayAgain: true,
    comment: 'Decent round. Nice person, but handicap might be off by a few strokes.',
    status: 'pending',
  },
];

export function getPlayerRatingSummary() {
  const total = playerRatingEntries.length;
  const flagged = playerRatingEntries.filter((r) => r.status === 'flagged').length;
  const approved = playerRatingEntries.filter((r) => r.status === 'approved').length;
  const avg = total === 0 ? 0 : playerRatingEntries.reduce((acc, r) => acc + r.overallRating, 0) / total;
  return { total, flagged, approved, avgRating: Number(avg.toFixed(1)) };
}

export function getProfileById(profileId: string): PlayerRatingProfile | undefined {
  return playerRatingProfiles.find((p) => p.id === profileId);
}

export function getRatingsByProfile(profileId: string): PlayerRatingEntry[] {
  return playerRatingEntries.filter((r) => r.profileId === profileId);
}

export function getRatingById(ratingId: string): PlayerRatingEntry | undefined {
  return playerRatingEntries.find((r) => r.id === ratingId);
}
