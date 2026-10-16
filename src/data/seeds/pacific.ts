import type { Spot } from '../../types';

// Pacific starter spots: Washington, Oregon, and Northern/Central California
// (California deserts, Owens Valley and the Alabama Hills live in another
// region file). Researched 2026-10-16. Values come from the pages in each
// spot's `sources`; ASSUMPTION marks anything no source states.

export const PACIFIC_SPOTS: Spot[] = [
  // ── Olympic Peninsula, Washington ───────────────────────────────────────

  {
    id: 'forest-road-29-sappho',
    name: 'Forest Road 29 near Sappho',
    latitude: 48.04893, // Campendium
    longitude: -124.11133,
    siteType: 'dispersed',
    landManager: 'Olympic National Forest · Pacific Ranger District',
    stayLimitDays: 14, // Campendium; see rules for the forest's yearly cap
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'Paved road in good shape to a gravel camping area. Farther up, FR 29 turns to gravel and gets narrower and rockier.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 40, // "32 ft Class A and a 40 ft fifth wheel side by side" (Jun 2025)
      bigRig: true, // 37 ft fifth wheel stayed 14 days (Oct 2026)
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No toilets, water or trash service. The main area fits about 10 RVs. If it is full, campers use a bigger gravel lot just past the next left.',
    },
    // Not in the data model yet: elevation about 885 ft. Verizon and AT&T
    // work; Starlink works.
    amenities: [],
    rules: [
      'Stay up to 14 days at one spot',
      'A 2024–2026 forest order capped camping at 21 days per calendar year on Olympic National Forest. Check whether it has been renewed',
      'Logging trucks use the road on weekdays. Keep the road clear',
      'Pack out all trash',
      'Check current fire restrictions before making a campfire',
    ],
    directions:
      'From US 101 between Lake Crescent and Sappho, turn south on Cooper Ranch Road, which becomes Forest Road 29. The camping area is about a mile in. Handy for Sol Duc and Forks.',
    phone: '(360) 374-6522', // Pacific Ranger District, Forks office
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Forest Road 29 Dispersed Camping',
        url: 'https://maps.campendium.com/us/sappho-wa/nature/forest-road-29-dispersed-camping',
      },
      {
        label: 'Boondockers Bible: Olympic National Forest dispersed sites (FR 29 North)',
        url: 'https://www.boondockersbible.com/learn/5-dispersed-camping-sites-in-olympic-national-forest/',
      },
      {
        label: 'Forest Service: Olympic National Forest camping stay limitations',
        url: 'https://fs.usda.gov/r06/olympic/alerts/olympic-national-forest-camping-stay-limitations',
      },
    ],
  },

  // ── Stevens Pass corridor, Washington ───────────────────────────────────

  {
    id: 'old-cascade-highway-skykomish',
    name: 'Old Cascade Highway near Skykomish',
    latitude: 47.71844, // The Dyrt
    longitude: -121.20891,
    siteType: 'dispersed',
    landManager: 'Mt. Baker-Snoqualmie National Forest · Skykomish Ranger District',
    stayLimitDays: 14, // 14 days at one spot, 28 days a year on the forest
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface:
        'Paved old highway with rocks sticking up in places and a big rock at the turn into one site. The site just south of the bridge is 4WD only.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // an extended Sprinter van made it past the rocks (Oct 2025)
      maxTrailerFt: 0, // "Not suited to trailers or large RVs" (Oct 2025)
      bigRig: false,
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No toilets, water or trash service. Small sites, about nine near the bridge. Some riverside tent spots are a short walk from parking. Cell service is spotty, and the tall trees can block Starlink.',
    },
    amenities: ['River access'],
    rules: [
      'Stay up to 14 days at one spot and 28 days per calendar year on the forest',
      'Store food in a bear-resistant way (forest-wide food storage order)',
      'Camp at least 100 feet from the river',
      'Pack out all trash and toilet paper',
      'Check fire restrictions before making a campfire',
    ],
    directions:
      'From Skykomish, drive east on US 2 a few miles and turn onto the Old Cascade Highway. Sites are spread within about a mile on either side of a bridge. Campers say to watch for the turnoff on the right just before the bridge. Walk the turn-in first: a big rock sits at the entrance to one site.',
    phone: '(360) 677-2414', // Skykomish Ranger Station
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'The Dyrt: Old Cascades Highway Dispersed',
        url: 'https://www.thedyrt.com/camping/washington/old-cascades-highway-dispersed',
      },
      {
        label: 'Forest Service: Mt. Baker-Snoqualmie dispersed camping',
        url: 'https://www.fs.usda.gov/r06/mbs/recreation/dispersed-camping',
      },
      {
        label: 'Forest Service: Skykomish District road damage and closures (Old Cascade Highway not listed)',
        url: 'https://www.fs.usda.gov/r06/mbs/alerts/road-damages-closures-skykomish-district',
      },
    ],
  },

  // ── Concrete, Washington ────────────────────────────────────────────────

  {
    id: 'concrete-grandy-creek-koa',
    name: 'Concrete / Grandy Creek KOA Holiday',
    latitude: 48.5364, // koa.com map link
    longitude: -121.8765,
    siteType: 'campground',
    landManager: 'KOA (private) · Concrete / Grandy Creek KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 2, // ASSUMPTION: highway, then a short local road
      drivetrain: '2wd-ok',
      surface: 'WA 20, then about half a mile on Russell Road',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION
      maxTrailerFt: 45, // koa.com lists "45' max length" but also pull-throughs up to 85–90 ft
      bigRig: true, // long pull-through sites listed
      turnaround: true, // pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: 85, // Campendium, last nightly rate reported Jul 2026
      hookups: ['electric', 'water', 'sewer'], // 50-amp max; full hookups per Campendium
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. Latest RV price seen: $85 (July 2026). Seasonal: open April 25 to November 2. Some extras cost more (Wi-Fi, mini golf, firewood).',
    },
    amenities: [
      'Showers',
      'Laundry',
      'Pool (seasonal)',
      'Hot tub/sauna',
      'Camp store',
      'Wi-Fi (paid)',
      'Dog park',
      'Playground',
      'Mini golf',
      'Cabins and yurts',
      'Dump station',
    ],
    rules: [
      'RV and tent sites: check in 12 pm, check out 11 am',
      'Cabins and yurts: check in 4 pm, check out 11 am',
      'Pets allowed under the KOA pet policy',
    ],
    directions:
      "Don't follow Google directions, which may send you up Baker Lake Road. From I-5 exit 230, take WA 20 east about 23 miles to Russell Road (just past Baker Lake Road). Turn left and go straight about half a mile to the campground.",
    phone: '(360) 826-3554',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Concrete / Grandy Creek KOA Holiday', url: 'https://koa.com/campgrounds/concrete/' },
      {
        label: 'Campendium: Concrete-Grandy Creek KOA',
        url: 'https://maps.campendium.com/us/concrete-wa/camping-rv/concrete-grandy-creek-koa-concrete-wa',
      },
    ],
  },

  // ── Mount Hood, Oregon ──────────────────────────────────────────────────

  {
    id: 'trillium-lake-airstrip',
    name: 'Trillium Lake Airstrip',
    latitude: 45.28113, // Campendium
    longitude: -121.7353,
    siteType: 'dispersed',
    landManager: 'Mt. Hood National Forest',
    stayLimitDays: 14, // 14 days at one spot, 28 days a year on the forest
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Paved road to a large, open, dusty gravel airstrip with some rocky ground.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 39, // 39 ft fifth wheel (Campendium, 2022)
      bigRig: true, // "at least two dozen big-rig spots" (2025)
      turnaround: true, // ASSUMPTION: big open lot; no source says so directly
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No toilets, water or trash service. Busy on summer weekends. The nearby Trillium Lake day-use area charges $10 per vehicle; campers report no fee at the airstrip.',
    },
    // Not in the data model yet: elevation about 3,600 ft. Good AT&T and
    // Verizon signal reported.
    amenities: ['Mount Hood views', 'Trillium Lake loop trail nearby'],
    rules: [
      'Stay up to 14 days at one spot and 28 days per calendar year on the forest',
      'No camping along state or US highways, or in developed sites like trailheads and campgrounds',
      'Pack out everything you bring. Campers ask everyone to keep it clean so the area stays open',
      'Check fire restrictions before making a campfire',
    ],
    directions:
      'From Government Camp, drive about 2 miles east on US 26. Turn right on Trillium Lake Road, then right on East Perry Vickers Road to the old airstrip. A gate across the road is closed under snow in winter and early spring.',
    phone: '(503) 668-1700', // Mt. Hood National Forest
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Trillium Lake Airstrip',
        url: 'https://maps.campendium.com/us/government-camp-or/nature/trillium-lake-airstrip',
      },
      {
        label: 'The Dyrt: dispersed camping near Government Camp (Mar 2026 review)',
        url: 'https://thedyrt.com/camping/oregon/near/government-camp/with/dispersed',
      },
      {
        label: 'Islands: free dispersed camping in Mt. Hood National Forest (Apr 2026)',
        url: 'https://www.islands.com/2141128/5-stunning-destinations-free-dispersed-camping-oregons-mt-hood-national-forest/',
      },
      {
        label: 'Forest Service: Mt. Hood dispersed camping',
        url: 'https://fs.usda.gov/r06/mthood/recreation/dispersed-camping',
      },
      {
        label: 'Mountain Times: dispersed vs. designated camping on Mt. Hood',
        url: 'https://mountaintimesoregon.com/2025/06/05/dispersed-vs-designated-camping-on-mt-hood',
      },
    ],
  },

  // ── Sisters, Oregon ─────────────────────────────────────────────────────

  {
    id: 'forest-road-4606-sisters',
    name: 'Forest Road 4606 south of Sisters',
    latitude: 44.26316, // The Dyrt
    longitude: -121.53839,
    siteType: 'dispersed',
    landManager: 'Deschutes National Forest',
    stayLimitDays: 14, // The Dyrt FAQ ("typically 14 days")
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface:
        'Wide gravel road with washboard, potholes and lots of dust. Side spurs have loose sand that can trouble 2WD cars, and some need high clearance.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 26, // 26 ft Class C parked here (2021)
      bigRig: null, // one reviewer called FS 4606 "pretty terrible" for an RV
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No toilets, water or trash service. Many large, level, spread-out sites with stone fire rings in pine forest. Good Verizon and T-Mobile signal reported.',
    },
    amenities: ['Mountain bike and hiking trails nearby'],
    rules: [
      'Deschutes NF Order 06-01-26-01 (2026–2031) bans camping in the Whychus Creek riparian corridor and a few other listed areas. Check the order before you pick a site',
      'Campfires are often banned in summer. Check current fire restrictions',
      'Stay up to 14 days',
      'Pack out all trash',
    ],
    directions:
      'From Sisters, take Three Creek Road south. Turn onto Forest Road 4606 (the Brooks Scanlon logging road) and keep going to find pull-offs and side spurs. The turnoff is hard to see in the dark. Mountain bikers sometimes ride past camps.',
    phone: '(541) 383-5300', // Deschutes NF number listed on the 2026 camping order
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'The Dyrt: Sisters, Oregon Dispersed Camping',
        url: 'https://thedyrt.com/camping/oregon/dispersed-camping-near-sisters',
      },
      {
        label: 'Forest Service: Deschutes camping and campfire restrictions (Order 06-01-26-01)',
        url: 'https://www.fs.usda.gov/r06/deschutes/alerts/camping-campfire-restrictions-forest-order',
      },
    ],
  },

  // ── Culver (Bend/Redmond), Oregon ───────────────────────────────────────

  {
    id: 'redmond-central-oregon-koa',
    name: 'Redmond / Central Oregon KOA Holiday',
    latitude: 44.5022, // koa.com GPS
    longitude: -121.17852,
    siteType: 'campground',
    landManager: 'KOA (private) · Redmond / Central Oregon KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 2, // ASSUMPTION: highway, then Jericho Lane
      drivetrain: '2wd-ok',
      surface: "US 97, then Jericho Lane. KOA says don't let GPS route you on dirt roads from Hwy 26",
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // 18 grass tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION
      maxTrailerFt: 70, // koa.com "70' Max Length"; Campendium lists 62 ft pull-throughs
      bigRig: true, // most RV sites are pull-throughs of about 60 ft
      turnaround: true,
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric', 'water', 'sewer'], // every RV site has water and power; many have sewer
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. A camper paid $58 for a full-hookup pull-through in September 2024. 30 and 50 amp. Open all year. About 32 miles north of Bend.',
    },
    amenities: [
      'Showers',
      'Laundry',
      'Pool (seasonal, saltwater)',
      'Camp store',
      'Wi-Fi',
      'Dog park',
      'Propane',
      'Firewood',
      'Playground',
      'Cabins',
      'Dump station',
    ],
    rules: [
      'Check in 2 pm, check out 12 pm',
      'Quiet hours 10 pm to 7 am',
      'Pets on a leash at all times except in the off-leash area',
      '5 mph speed limit in the park',
      'Tents only in the tent area or on RV pads, not on the grass at RV sites',
      'No fireworks',
    ],
    directions:
      'On US 97, 32 miles north of Bend, 16 miles north of Redmond, or 7 miles south of Madras. At mile marker 105, turn east on Jericho Lane. Coming from the east on Hwy 26, navigate to N44.502203, W121.178515 so GPS does not send you down dirt roads.',
    phone: '(541) 546-3046',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Redmond / Central Oregon KOA Holiday', url: 'https://koa.com/campgrounds/redmond/' },
      {
        label: 'KOA: Redmond general information',
        url: 'https://koa.com/campgrounds/redmond/general-information/',
      },
      { label: 'KOA: Redmond amenities', url: 'https://koa.com/campgrounds/redmond/amenities/' },
      {
        label: 'Campendium: Redmond - Central Oregon KOA',
        url: 'https://maps.campendium.com/us/culver-or/camping-rv/redmond-central-oregon-koa',
      },
    ],
  },

  // ── Alvord Desert, Oregon ───────────────────────────────────────────────

  {
    id: 'alvord-desert-playa',
    name: 'Alvord Desert Playa',
    latitude: 42.55979, // BLM Alvord Desert page (map link)
    longitude: -118.53283,
    siteType: 'dispersed',
    landManager: 'BLM · Burns District',
    stayLimitDays: 14, // Campendium
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'Long washboard gravel roads to a flat, dry lakebed. Sharp shale gravel is hard on tires. The playa clay turns slick and traps vehicles when wet.',
      impassableWhenWet: true,
    },
    fit: {
      tent: true, // BLM: "plenty of room for setting up a tent"
      rtt: true,
      van: true,
      maxTrailerFt: 25, // 25 ft travel trailer and 25 ft Class C (Campendium, 2020–2021)
      bigRig: null,
      turnaround: true, // ASSUMPTION: wide-open dry lakebed
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. The only facility is a vault toilet at Frog Springs. No water, no shade and little or no cell service. Fuel and food are in Fields, about an hour south. Help is hours away: bring extra water and a spare tire.',
    },
    // Not in the data model yet: elevation about 4,000 ft. Best June–November.
    amenities: ['Vault toilet at Frog Springs'],
    rules: [
      'Pack out everything, including human and pet waste',
      "Don't drive on the playa if it is wet or even looks damp",
      'Weddings, races, vehicle rallies and large gatherings need a BLM permit',
      'Check BLM fire restrictions. When fires are allowed, keep them in a raised fire pan',
      'Winds are strong and sudden: tie everything down',
    ],
    directions:
      'From Burns, take OR-78 southeast about 65 miles. Turn right (south) on East Steens Road (Folly Farm Road) and go about 40 miles southwest. Turn left (east) on the Frog Springs access road to reach the playa. The playa is usually dry enough to drive June through November.',
    phone: '(541) 573-4400', // BLM Burns District Office, Hines
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'BLM: Alvord Desert playa', url: 'https://www.blm.gov/visit/alvord-desert' },
      {
        label: 'Campendium: Alvord Desert',
        url: 'https://maps.campendium.com/us/fields-or/nature/alvord-desert-or--4',
      },
    ],
  },

  // ── Mount Shasta, California ────────────────────────────────────────────

  {
    id: 'sand-flat-mount-shasta',
    name: 'Sand Flat on Mount Shasta',
    latitude: 41.35393, // Campendium
    longitude: -122.24969,
    siteType: 'dispersed',
    landManager: 'Shasta-Trinity National Forest · Mount Shasta Ranger District',
    stayLimitDays: 14, // 14 days in one spot, 30 days a year on the forest
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok', // "AWD/4WD good but not really mandatory"
      surface:
        'Dirt forest roads. The lower road is narrow but OK slowly in most vehicles. The upper loop has ruts, gullies and large rocks: high clearance recommended.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 26, // 26 ft trailer towed in (2020); a 33 ft fifth wheel struggled on the upper road (2019)
      bigRig: null,
      turnaround: true, // a turnaround spot fits 3–4 large rigs (2019)
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No toilets, water or trash service. Sites spread along the forest roads, from full sun to shade, many with Mount Shasta views. Weekends fill up; weekdays are quieter.',
    },
    // Not in the data model yet: elevation about 6,700 ft.
    amenities: ['Sand Flat Trailhead to Horse Camp'],
    rules: [
      'A free California Campfire Permit is required year-round for campfires and camp stoves on the forest',
      'Stay up to 14 days in one spot and 30 days per calendar year on the forest',
      'Camp at least 200 feet from water, meadows and trails',
      'Hiking into the Mount Shasta Wilderness needs a wilderness permit. No dogs or wood fires there',
    ],
    directions:
      'From Mount Shasta city, drive about 11 miles up Everitt Memorial Highway. About 0.8 mile below Bunny Flat, turn left onto the Sand Flat dirt road. Reviewers suggest the lower road for entry. Walk ahead to check spots before driving in with anything bigger than a van.',
    phone: '(530) 926-4511', // Mount Shasta Ranger Station
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Sand Flat Dispersed Camping',
        url: 'https://maps.campendium.com/us/mount-shasta-ca/nature/sand-flat-dispersed-camping',
      },
      {
        label: 'Forest Service: Mt. Shasta Wilderness access guide (Sand Flat Trailhead)',
        url: 'https://fs.usda.gov/media/134728',
      },
      {
        label: 'Forest Service: Shasta-Trinity dispersed camping rules',
        url: 'https://www.fs.usda.gov/sites/nfs/files/legacy-media/shasta-trinity/Dispersed%20Camping%20ROG.pdf',
      },
      {
        label: 'Forest Service: Shasta-Trinity current conditions',
        url: 'https://www.fs.usda.gov/r05/shasta-trinity/conditions',
      },
    ],
  },

  {
    id: 'mount-shasta-city-koa',
    name: 'Mount Shasta City KOA Holiday',
    latitude: 41.32226, // koa.com GPS
    longitude: -122.3175,
    siteType: 'campground',
    landManager: 'KOA (private) · Mount Shasta City KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: in town, off paved city streets
      drivetrain: '2wd-ok',
      surface: 'Paved city streets off I-5 in Mount Shasta',
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION
      maxTrailerFt: 80, // koa.com max length 80 ft; Campendium lists 75 ft pull-throughs
      bigRig: true,
      turnaround: true, // pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: 66, // Campendium, last nightly rate reported Jun 2026
      hookups: ['electric', 'water', 'sewer'], // full hookups, 50/30/20 amp
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. Campers reported paying $40–$73 for RV sites (April 2025 to June 2026); latest seen $66 (June 2026). Open all year. A nearby train can be loud.',
    },
    amenities: [
      'Showers',
      'Laundry',
      'Pool (seasonal)',
      'Camp store',
      'Wi-Fi',
      'Dog park',
      'Propane',
      'Firewood',
      'Playground',
      'Cabins',
      'Dump station',
    ],
    rules: ['Check in 2 pm, check out 11 am', 'Pets allowed under the KOA pet policy'],
    directions:
      'From I-5 northbound, take exit 738 (Central Mount Shasta). Turn right on W. Lake Street, go about 0.3 mile to the second light, turn left on N. Mount Shasta Blvd., go about 0.5 mile and turn right on Hinckley. The entrance is on the left. From I-5 southbound, take exit 740 onto N. Mt. Shasta Blvd., go about 1 mile south and turn left on Hinckley.',
    phone: '(530) 926-4029',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Mount Shasta City KOA Holiday', url: 'https://koa.com/campgrounds/mount-shasta/' },
      {
        label: 'KOA: Mount Shasta extended stays (hookups, max length)',
        url: 'https://koa.com/campgrounds/mount-shasta/extended-stays/',
      },
      {
        label: 'Campendium: Mount Shasta City KOA',
        url: 'https://maps.campendium.com/us/mount-shasta-ca/camping-rv/mount-shasta-city-koa',
      },
    ],
  },

  // ── Lassen, California ──────────────────────────────────────────────────

  {
    id: 'north-manzanita-lassen',
    name: 'North Manzanita Dispersed near Lassen Volcanic',
    latitude: 40.53707, // The Dyrt
    longitude: -121.59467,
    siteType: 'dispersed',
    landManager: 'Lassen National Forest',
    stayLimitDays: 14, // within a mile of one site (Forest Order 06-24-01)
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface:
        'Dusty dirt road with deep ruts in places. Fine for 2WD near the highway when dry. Rougher deeper in, where 4x4 helps.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 23, // 23 ft rig on level ground by the creek (2025)
      bigRig: null,
      turnaround: true, // "A big rig could turn around" (2024)
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No toilets, water or trash service. A creek is about 100 yards up the road (treat the water). Highway 44 traffic is audible from the front sites. Weak or no cell service; Starlink works.',
    },
    amenities: ['Creek nearby', 'Close to Manzanita Lake in Lassen Volcanic National Park'],
    rules: [
      'Stay no more than 14 days within a mile of one site, and 30 days a year outside campgrounds (2024–2026 forest order; check for renewal)',
      'A free California Campfire Permit is needed for campfires and stoves outside campgrounds',
      'Burn bans are common. If fires are allowed, sweep pine needles to bare dirt around the ring',
      'Bears are active here. Keep food locked up',
      'Pack out all trash',
    ],
    directions:
      'Off Highway 44 near the northwest (Manzanita Lake) entrance of Lassen Volcanic National Park. Turn onto the gravel forest road; the first sites are on the first rise and in a clearing within about 100 yards of the highway. Quieter sites are farther up the road.',
    phone: '(530) 257-2151', // Lassen National Forest Supervisor's Office
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'The Dyrt: 31N17N - North Manzanita Dispersed Camping',
        url: 'https://www.thedyrt.com/camping/california/31n17n-north-manzanita-dispersed-camping',
      },
      {
        label: 'Forest Service: Lassen National Forest camping restrictions (Order 06-24-01)',
        url: 'https://www.fs.usda.gov/r05/lassen/alerts/forest-order-number-06-24-01-lassen-national-forest-camping-restrictions',
      },
    ],
  },

  // ── Yosemite, California ────────────────────────────────────────────────

  {
    id: 'hardin-flat-road-yosemite',
    name: 'Hardin Flat Road near Yosemite',
    latitude: 37.81113, // Campendium
    longitude: -119.9056,
    siteType: 'dispersed',
    landManager: 'Stanislaus National Forest · Groveland Ranger District',
    stayLimitDays: 21, // 21 days per calendar year in a ranger district
    access: {
      clearanceTier: 1,
      drivetrain: '2wd-ok',
      surface:
        'Paved roads to the sites, per reviewers. In spring, snow, mud and fallen trees can block the upper ridge.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 44, // 44 ft reported (Campendium, 2023)
      bigRig: true, // 43 ft toy hauler stayed 8 days (Apr 2025)
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No toilets, water or trash service. Only a handful of big sites, and they fill fast in peak season. About 3 miles from the Big Oak Flat entrance to Yosemite.',
    },
    // Not in the data model yet: elevation about 4,200 ft. Verizon 1–2 bars;
    // T-Mobile spotty.
    amenities: [],
    rules: [
      'A free California Campfire Permit is required for campfires, stoves and lanterns outside campgrounds',
      'Camp no more than 21 days per calendar year in a ranger district',
      'Park within one vehicle length of the road. Camp at least 100 feet from meadows, lakes and streams',
      'Forest roads close for winter from about December 15 to April 15',
      'Check current fire restrictions before making a campfire',
    ],
    directions:
      "Off CA 120 a few miles west of Yosemite's Big Oak Flat entrance. Turn onto Hardin Flat Road (some campers come in on Golden Arrow Road) and look for sites along the forest roads. Hardin Flat Road also passes private resorts: camp only on national forest land.",
    phone: '(209) 962-7825', // Groveland Ranger District
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Hardin Flat Road Dispersed Campsites',
        url: 'https://maps.campendium.com/us/groveland-ca/camping-rv/hardin-flat-road-dispersed-campsites',
      },
      {
        label: 'Forest Service: Stanislaus dispersed camping guide (Aug 2026)',
        url: 'https://www.fs.usda.gov/media/273067',
      },
    ],
  },

  // ── Sequoia and Kings Canyon, California ────────────────────────────────

  {
    id: 'big-meadows-road-sequoia',
    name: 'Big Meadows Road near Kings Canyon',
    latitude: 36.71165, // Campendium
    longitude: -118.85685,
    siteType: 'dispersed',
    landManager: 'Sequoia National Forest · Hume Lake Ranger District',
    stayLimitDays: 14, // 14 consecutive days in any 30-day period
    access: {
      clearanceTier: 1,
      drivetrain: '2wd-ok',
      surface: 'Paved road with many pull-in sites along it. Some sites are uneven.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 36, // 36 ft fifth wheel (Campendium, 2023)
      bigRig: true, // "plenty of spots for big rigs" (2023)
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. Reviewers mention pit toilets and bear-proof dumpsters near the road entrance. No water. Busy and loud on holiday weekends; weekdays are calmer.',
    },
    // Not in the data model yet: elevation about 7,700 ft. Cell service is
    // weak and fades farther up the road.
    amenities: ['Pit toilets near the entrance', 'Bear-proof dumpsters'],
    rules: [
      'Stay up to 14 days in any 30-day period',
      'Under the 2026 forest fire restrictions, fires are banned outside designated campfire areas. Check current rules',
      'Black bears are active. Store food and trash properly',
      'Pack out what you bring',
    ],
    directions:
      'From the Generals Highway between Grant Grove and Lodgepole, turn onto Big Meadows Road. Sites line the road. Snow closes the road in winter and spring: in April 2025 it was closed a few miles in, with spots still open before the closure.',
    phone: '(559) 338-2251', // Hume Lake Ranger District
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Western Big Meadow Road Camping Area',
        url: 'https://maps.campendium.com/us/hume-ca/nature/western-big-meadow-road-camping-area',
      },
      {
        label: 'Forest Service: Sequoia National Forest alerts',
        url: 'https://fs.usda.gov/r05/sequoia/alerts',
      },
    ],
  },
];
