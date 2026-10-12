// Starter spots bundled with the app. The app uses these until Supabase is
// connected (see README), and supabase/migrations/0001_init.sql seeds the
// same data into the database.
//
// Every value comes from the public listings in each spot's `sources`
// (checked 2026-10-07). Anything marked ASSUMPTION was not in a source;
// `null` means no source reported it. Confirm on your next visit, update it
// here, run `npm run seed:sql`, then set `verified: true`.
//
// "Not in the data model yet" notes keep useful facts (elevation, cell
// signal) for when the app gets fields for them.

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
      bigRig: null, // 15 RV sites with hookups, but no source says how big
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

  // ── Sublett Reservoir, Idaho ────────────────────────────────────────────
  // Three spots around the reservoir, west to east: the dam (Fish and Game),
  // the Forest Service campground, and dispersed sites on FR 583 past it.

  {
    id: 'sublett-dam',
    name: 'Sublett Dam',
    latitude: 42.32407, // Campendium
    longitude: -113.04674,
    siteType: 'dispersed',
    landManager: 'Idaho Fish and Game · Sublett Reservoir access',
    // Fish and Game rule for any one access site. Campendium lists 14 days;
    // the agency's own rule is stricter, so it wins.
    stayLimitDays: 10,
    access: {
      clearanceTier: 2, // "well-maintained and graveled", "pretty smooth and easy" to the dam
      drivetrain: '2wd-ok',
      surface: 'Graded gravel Sublett Road, then a narrow road across the dam',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true, // ASSUMPTION: open gravel parking
      van: true, // ASSUMPTION: RVs up to 35 ft camp here
      maxTrailerFt: 35,
      bigRig: false, // 35 ft max, plus the narrow dam crossing
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free camping on a Fish and Game access site.',
    },
    amenities: ['Vault toilet', 'Fishing access'],
    rules: [
      'Stay up to 10 days in any 30-day period on this access site',
      "Don't leave a camp, vehicle or trailer unattended for more than 48 hours",
      'Motor vehicles only on designated roads and trails',
      'Idaho fishing license required to fish',
    ],
    directions:
      'From I-84 exit 245, follow Sublett Road (FR 565) east to the dam at the west end of Sublett Reservoir. The camping is across the dam on a narrow road: a camper reports folding in mirrors to pass the valve works.',
    phone: '(208) 324-4359', // Fish and Game, Magic Valley Region (Jerome)
    // Not in the data model yet: elevation 5,314 ft. Signal: Verizon 1 bar at
    // times; AT&T and T-Mobile little or none (camper reports through 2024).
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'Campendium: Sublett Dam', url: 'https://maps.campendium.com/us/malta-id/nature/sublett-dam' },
      { label: 'Idaho Fish and Game: public use rules', url: 'https://idfg.idaho.gov/wma/public-use-rules' },
      { label: 'Idaho Fish and Game: Magic Valley office', url: 'https://idfg.idaho.gov/office/magic-valley' },
    ],
  },

  {
    id: 'sublett-campground',
    name: 'Sublett Campground',
    latitude: 42.32765, // Forest Service records, via Outdoorithm
    longitude: -113.00256,
    siteType: 'campground',
    landManager: 'Sawtooth National Forest · Minidoka Ranger District',
    stayLimitDays: 14, // Campendium
    access: {
      // Campers: smooth to the dam, "a bit rougher" past it, washboard on the
      // way around the reservoir, "nothing any trailer shouldn't be able to handle".
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface: 'Gravel Sublett Road (FR 565): smooth to the dam, rougher with washboard past it',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true, // ASSUMPTION: developed sites with parking
      van: true,
      maxTrailerFt: 20, // Campendium: max RV length 20 ft
      bigRig: false,
      turnaround: true, // one small loop
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'first-come',
      notes: 'Free, no reservations. 5 to 9 small sites in one loop (sources differ). No drinking water.',
    },
    amenities: ['Vault toilet', 'Picnic tables', 'Fire rings', 'Grills'],
    rules: ['Pack it in, pack it out', 'No drinking water on site: bring your own'],
    directions:
      'From I-84 exit 245, go east about 13 miles on Sublett Road (FR 565) around the north end of Sublett Reservoir. Usually reachable June through November. The grass sites can get muddy when wet.',
    phone: '(208) 678-0430', // Minidoka Ranger District, Burley
    // Not in the data model yet: elevation about 5,430 ft. No Verizon signal
    // (camper reports, 2020 and 2022).
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Sublett Campground',
        url: 'https://maps.campendium.com/us/malta-id/nature/sublett-campground-malta',
      },
      {
        label: 'Outdoorithm: Sublett Campground (Forest Service data)',
        url: 'https://outdoorithm.com/campgrounds/id/sawtooth/sublett-campground',
      },
      {
        label: 'Forest Service: Minidoka Ranger District',
        url: 'https://www.fs.usda.gov/r04/sawtooth/offices/minidoka-ranger-district',
      },
    ],
  },

  {
    id: 'south-fork-sublett-creek',
    name: 'South Fork Sublett Creek',
    latitude: 42.32942, // Campendium
    longitude: -112.99628,
    siteType: 'dispersed',
    landManager: 'Sawtooth National Forest · Minidoka Ranger District',
    stayLimitDays: 14, // Campendium
    // No camper has reported on this road yet.
    access: {
      clearanceTier: null,
      drivetrain: null,
      surface: 'Forest Road 583',
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // Campendium: tent camping yes
      rtt: null,
      van: null,
      maxTrailerFt: null,
      bigRig: null,
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free dispersed camping.',
    },
    amenities: [],
    rules: ['Pack it in, pack it out'],
    directions:
      'On Forest Road 583, about half a mile east of Sublett Campground (see that spot for the drive in). Open seasonally. No camper reports on this road yet, so scout it before you drive in.',
    phone: '(208) 678-0430', // Minidoka Ranger District, Burley
    // Not in the data model yet: elevation about 5,450 ft.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: South Fork Sublett Creek Dispersed Camping',
        url: 'https://maps.campendium.com/us/rockland-id/camping-rv/south-fork-sublett-creek-dispersed-camping',
      },
    ],
  },

  // ── Packwood, Washington ────────────────────────────────────────────────

  {
    id: 'forest-road-46-packwood',
    name: 'Forest Road 46 near Packwood',
    // APPROXIMATE: the turnoff from US 12, worked out from the road mileages
    // in the sources (no source lists coordinates). Could be off by a few
    // hundred yards. Drop an exact pin on your next visit.
    latitude: 46.653,
    longitude: -121.614,
    siteType: 'dispersed',
    landManager: 'Gifford Pinchot National Forest · Cowlitz Valley Ranger District',
    stayLimitDays: 14, // forest-wide: move off the forest after 14 consecutive days
    access: {
      clearanceTier: 2, // ASSUMPTION from "firm, well-packed gravel" (Trails Offroad)
      drivetrain: '2wd-ok', // ASSUMPTION, same source
      surface: 'Firm, well-packed gravel forest road with a steady climb',
      impassableWhenWet: null,
    },
    fit: {
      // ASSUMPTION: campsites "capable of accommodating three to five vehicles".
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: null,
      bigRig: null,
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. Parking at the Clear Fork trailhead at the end of the road needs a Northwest Forest Pass or America the Beautiful pass.',
    },
    amenities: [
      'Clear Fork Trail #61',
      'Bluff Lake Trail #65',
      'Three Peaks Trail #69',
      'Creek access at Dam Creek bridge',
    ],
    rules: [
      'Move off the forest after 14 consecutive days',
      'Pack it in, pack it out',
      'Never leave a campfire unattended, and check current fire restrictions',
      "Don't cut standing trees",
    ],
    directions:
      'From Packwood, drive about 4.8 miles east on US 12 (2.8 miles west of the SR 123 junction) and turn right onto Forest Road 46. At 0.6 mile, keep left to stay on FR 46. Several camps sit near the Purcell Creek Road (FR 4610) junction, about 1.6 miles in; the road ends at the Clear Fork trailhead about 8 miles in. The pin marks the turnoff from US 12 and is approximate.',
    phone: '(360) 497-1103', // Cowlitz Valley Ranger District, Randle
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Forest Service: Forest Road 46',
        url: 'https://www.fs.usda.gov/r06/giffordpinchot/recreation/forest-road-46',
      },
      {
        label: 'Forest Service: Gifford Pinchot dispersed camping',
        url: 'https://www.fs.usda.gov/r06/giffordpinchot/recreation/dispersed-camping',
      },
      {
        label: 'Trails Offroad: Lava Creek (FR 46)',
        url: 'https://www.trailsoffroad.com/US/washington/scout-routes/5148-lava-creek',
      },
      { label: 'WTA: Clear Fork', url: 'https://www.wta.org/go-hiking/hikes/clear-fork' },
      { label: 'WTA: Bluff Lake', url: 'https://www.wta.org/go-hiking/hikes/bluff-lake' },
    ],
  },

  // ── Black Hills, South Dakota ───────────────────────────────────────────

  {
    id: 'forest-road-356-black-hills',
    name: 'Forest Road 356 near Mount Rushmore',
    latitude: 43.90099, // The Dyrt
    longitude: -103.524,
    siteType: 'dispersed',
    landManager: 'Black Hills National Forest · Mystic Ranger District',
    stayLimitDays: 14, // 14 days in any 60-day period
    access: {
      // Rated for the first sites, where most campers stop: "bumpy but
      // generally passable in a standard 2WD vehicle, at least for the first
      // half mile". Further in: "High clearance required after the first 3 sites".
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface: 'Bumpy gravel with ruts. 2WD OK to the first sites; high clearance past the first 3 sites',
      impassableWhenWet: null, // big puddles and soft ground after storms
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 30, // "We have a 30ft trailer and had no problem" (Sep 2026)
      bigRig: false, // "Anything longer will have issues"
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free dispersed camping. No facilities: no water, toilets or trash service.',
    },
    amenities: [],
    rules: [
      'No open campfires anywhere in the South Dakota part of the Black Hills National Forest',
      'Stay up to 14 days in any 60-day period',
      'Camp at least 100 feet from streams and half a mile from developed recreation sites',
      'Drive no more than 300 feet off roads shown open on the Motor Vehicle Use Map',
      'Pack out all trash and toilet paper',
    ],
    directions:
      'On Forest Road 356 near SD-244, between Hill City and Mount Rushmore. The pin is about 0.6 mile east of the Mount Rushmore KOA at Palmer Gulch, which is about 5 miles west of the monument. Longer rigs should stay at the first sites. After heavy rain expect big puddles and soft ground. Signal is patchy, so save your location before you head in.',
    phone: '(605) 343-1567', // Mystic Ranger District, Rapid City
    // Not in the data model yet: AT&T good, Verizon some, T-Mobile none
    // (camper reports through 2026). Watch for broken glass in tent spots
    // and yellow jackets in late summer.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'The Dyrt: RD 356 Dispersed Site',
        url: 'https://thedyrt.com/camping/south-dakota/rd-356-dispersed-site-black-hills-national-forest',
      },
      {
        label: 'Forest Service: Black Hills dispersed camping',
        url: 'https://www.fs.usda.gov/r02/blackhills/recreation/dispersed-camping',
      },
      {
        label: 'Forest Service: Mystic Ranger District',
        url: 'https://fs.usda.gov/r02/blackhills/offices/mystic-ranger-district',
      },
      { label: 'Mount Rushmore KOA at Palmer Gulch', url: 'https://koa.com/campgrounds/mount-rushmore/' },
    ],
  },
];
