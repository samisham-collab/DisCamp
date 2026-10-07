// Starter spots bundled with the app. The app uses these until Supabase is
// connected (see README), and supabase/migrations/0001_init.sql seeds the
// same data into the database.
//
// Anything marked ASSUMPTION was not in a public source. Confirm it on your
// next visit, update it here and in the SQL seed, then set `verified: true`.

import type { Spot } from '../types';

export const SEED_SPOTS: Spot[] = [
  {
    id: 'smoky-gardens',
    name: 'Smoky Gardens',
    // Approximate, from the PDGA disc golf listing (39.19, -101.76).
    // Drop an exact pin on your next visit.
    latitude: 39.19,
    longitude: -101.76,
    siteType: 'campground',
    landManager: 'Sherman County · Soldiers Memorial Park',
    stayLimitDays: null,
    access: {
      clearanceTier: 2, // ASSUMPTION: graded county gravel roads
      drivetrain: '2wd-ok', // ASSUMPTION
      surface: 'Highway 27, then county roads',
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // dry camping allowed anywhere in the park
      rtt: true,
      van: true,
      maxTrailerFt: null,
      bigRig: true, // 15 RV sites with hookups
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: 20,
      hookups: ['electric', 'water'],
      reservations: 'not-needed',
      notes: '15 RV sites with electric and water, first come, first served. Dry camping anywhere in the park is free.',
    },
    amenities: [
      'Stocked fishing lake',
      'Restroom',
      'Walking trails',
      '9-hole disc golf',
      'Picnic shelters',
      'Playground',
      'Boat ramp',
    ],
    rules: [
      'Kansas fishing license required',
      'No swimming',
      'Boats allowed: life jackets required, no gas motors',
      'No park pass needed',
    ],
    directions:
      'From Goodland, take Highway 27 south 6 miles. Turn right (west) on County Road 57 for 2 miles, left (south) on County Road 17 for 3 miles, then left into Soldiers Memorial Park.',
    phone: '(785) 899-6334',
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Sherman County Community Development: Lodging',
        url: 'https://www.thetopsideofkansas.org/community/plan-your-visit/lodging',
      },
      {
        label: 'Sherman County Community Development: Soldiers Memorial Park',
        url: 'https://www.thetopsideofkansas.org/community/plan-your-visit/attractions/soldiers-memorial-park',
      },
      {
        label: 'PDGA: Smoky Gardens Disc Golf Course',
        url: 'https://www.pdga.com/course-directory/course/smoky-gardens-disc-golf-course',
      },
    ],
  },
];
