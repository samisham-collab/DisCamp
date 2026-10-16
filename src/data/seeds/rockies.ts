import type { Spot } from '../../types';

export const ROCKIES_SPOTS: Spot[] = [
  // ── Kenosha Pass, Colorado ──────────────────────────────────────────────

  {
    id: 'kenosha-pass-dispersed',
    name: 'Kenosha Pass Dispersed Sites',
    latitude: 39.41711, // Campendium
    longitude: -105.75256,
    siteType: 'dispersed',
    landManager: 'Pike National Forest · South Platte Ranger District',
    stayLimitDays: 14, // 14 days in any 30-day period within a 20-mile radius (Pike NF order)
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok', // A 2WD Dodge Durango made it with care (Sep 2023)
      surface:
        'Good two-lane dirt to the campground split, then ruts, potholes and dips. An AWD car nearly bottomed out (Jun 2026)',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 30, // "The first sites can fit 30 foot travel trailers" (Campendium, 2021)
      bigRig: null, // A 36 ft fifth wheel got in but called it "tough" (2021); a 38 ft bus fit Site 1 (Jul 2026)
      turnaround: false, // The right-hand road ends at a gate with no real turnaround; back out past site 3
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free designated dispersed sites, each marked with a sign. No water, toilets or trash service. The fee campground next door is separate.',
    },
    amenities: ['Hiking trails nearby'],
    rules: [
      'Camp only at signed, numbered sites',
      'Stay up to 14 days in any 30 days within the same 20-mile area',
      'Stage 1 fire restrictions were in effect on Pike-San Isabel from Aug. 21, 2026. Check before any campfire',
      'Pack out all trash',
    ],
    directions:
      'At the top of Kenosha Pass on US-285, about 50 miles southwest of Denver. Turn in toward the campground. Where the road splits, the left fork goes into the fee campground; the straight and right forks go to the free numbered sites. The right fork ends at a gate, so smaller rigs only.',
    phone: '(303) 275-5610', // South Platte Ranger District
    // Not in the data model yet: about 10,000 ft elevation; no Verizon or T-Mobile signal reported.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Kenosha Pass Dispersed Camping',
        url: 'https://maps.campendium.com/us/jefferson-co/camping-rv/kenosha-pass-dispersed-camping',
      },
      {
        label: 'The Dyrt: Kenosha Pass East Dispersed',
        url: 'https://thedyrt.com/camping/colorado/kenosha-pass-east-dispersed',
      },
      {
        label: 'Forest Service: Pike National Forest occupancy and use restrictions',
        url: 'https://www.fs.usda.gov/r02/psicc/alerts/pike-national-forest-occupancy-and-use-restrictions',
      },
      {
        label: 'Forest Service: Kenosha Pass Campground',
        url: 'https://fs.usda.gov/r02/psicc/recreation/kenosha-pass-campground',
      },
    ],
  },

  // ── Telluride, Colorado ─────────────────────────────────────────────────

  {
    id: 'alta-lakes-telluride',
    name: 'Alta Lakes Designated Sites near Telluride',
    latitude: 37.88463, // Forest Service
    longitude: -107.84668,
    siteType: 'dispersed',
    landManager: 'Grand Mesa, Uncompahgre and Gunnison National Forests · Norwood Ranger District',
    stayLimitDays: null, // Forest Service page gives none; Campendium lists 7 days
    access: {
      clearanceTier: 4, // Forest Service: high-clearance vehicle required; reviewers report boulders in the road
      drivetrain: '4wd-required', // The Dyrt listing: high clearance and 4WD required; a 2WD Titan slipped near the top (Aug 2026)
      surface:
        'Narrow, rocky, rutted shelf road with boulders, tight switchbacks and steep drop-offs. One lane in places, so pull over for uphill traffic',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // A van made it but the driver did not recommend it (Oct 2026)
      maxTrailerFt: 0, // Forest Service: trailers and RVs are not allowed
      bigRig: false,
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. About 20 designated sites, first come, first served. Portable toilets on site, no drinking water. Busy in summer.',
    },
    amenities: ['Portable toilets', 'Alpine lakes for fishing and paddling', 'Hiking and biking trails'],
    rules: [
      'Camp only in the designated sites (marked by poles)',
      'No trailers or RVs',
      'Quiet hours 10 p.m. to 6 a.m.',
      'Pack in, pack out',
      'Check current fire rules with the Norwood Ranger District before any campfire',
      'Campendium lists a 7-day stay limit. Confirm with the district',
    ],
    directions:
      'Drive about 5 miles south of Telluride on CO-145. Turn east on Forest Road 632 (Alta Road) and climb about 4.3 miles past the old Alta townsite. Allow 40 to 50 minutes. Open June through late fall; snow can block the top in May and the road has closed for conditions before.',
    phone: '(970) 327-4261', // Norwood Ranger District, as listed on The Dyrt
    // Not in the data model yet: about 11,100 ft elevation; only spotty AT&T signal reported.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Forest Service: Alta Lakes Campground (Designated)',
        url: 'https://www.fs.usda.gov/r02/gmug/recreation/alta-lakes-campground-designated-norwood-rd',
      },
      {
        label: 'The Dyrt: Alta Lakes Dispersed Camping',
        url: 'https://thedyrt.com/camping/colorado/alta-lakes-dispersed-camping',
      },
      {
        label: 'Campendium: Alta Lakes Designated Dispersed Campsites',
        url: 'https://maps.campendium.com/us/telluride-co/camping-rv/alta-lakes-designated-dispersed-campsites-telluride',
      },
    ],
  },

  // ── Strasburg (I-70 east of Denver), Colorado ───────────────────────────

  {
    id: 'denver-east-strasburg-koa',
    name: 'Denver East / Strasburg KOA Holiday',
    latitude: 39.73536, // KOA's map pin
    longitude: -104.3214,
    siteType: 'campground',
    landManager: 'KOA (private) · Denver East / Strasburg KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: right off the I-70 frontage road in town
      drivetrain: '2wd-ok',
      surface: 'Right off the I-70 frontage road in Strasburg',
      impassableWhenWet: false, // ASSUMPTION: in-town campground off a frontage road
    },
    fit: {
      tent: true, // KOA lists premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 70, // KOA text says sites up to 70 ft; amenities list says 75 ft. Using the lower number
      bigRig: true, // KOA lists "Big Rig Friendly" with pull-through sites
      turnaround: true, // Pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric'], // KOA lists 50-amp service; water and sewer hookups are not spelled out
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. KOA lists 50-amp electric; ask about water and sewer at your site. Open all year. Campers mention I-70 road noise and an occasional train.',
    },
    amenities: [
      'Pool (seasonal)',
      'Wi-Fi',
      'Cable TV',
      'Laundry',
      'Propane',
      'Firewood',
      'Snack bar',
      'Game room',
      'Outdoor movie theater',
      'Deluxe cabins',
    ],
    rules: ['Check-in 2:00 p.m., check-out 11:00 a.m.', 'Office open 10 a.m. to 7 p.m. daily'],
    directions:
      'Take I-70 Exit 310 (Strasburg) and head east on the north frontage road. The campground is right next to I-70, at 1312 Monroe Street, across from the blue NAPA building.',
    phone: '(303) 622-9274',
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'KOA: Denver East / Strasburg KOA Holiday',
        url: 'https://koa.com/campgrounds/denver-east/albums/',
      },
      {
        label: 'KOA: Denver East / Strasburg KOA Holiday (details)',
        url: 'https://preview.koa.com/campgrounds/denver-east/',
      },
    ],
  },

  // ── Stanley, Idaho ──────────────────────────────────────────────────────

  {
    id: 'nip-and-tuck-road-stanley',
    name: 'Nip and Tuck Road near Stanley',
    latitude: 44.24915, // Campendium
    longitude: -114.97132,
    siteType: 'dispersed',
    landManager: 'Sawtooth National Forest · Sawtooth National Recreation Area',
    stayLimitDays: 10, // 10 days in 30, May 1 to Sept. 15 (16 days the rest of the year), Forest Service order 0414-04-134
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok', // Class C made it fine from the west (Jul 2025)
      surface:
        'Dusty dirt with potholes and washboard from the ID-21 end. Narrower, rougher and off-camber higher up. The ID-75 end has a deep wash',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 30, // A 31 ft travel trailer and a 30 ft toy hauler made it in 2026; a 30 ft Airstream found it rough (Jul 2026)
      bigRig: null, // A 36 ft Class A made it in 2021, but big rigs should stay on the lower sites near ID-21
      turnaround: null, // No place to turn around near the top (2022 review)
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping with Sawtooth views. No facilities: no water, toilets or trash service. Get water in Stanley. Busy with ATVs on weekends.',
    },
    amenities: ['Views of the Sawtooth Mountains', 'Close to Stanley and Redfish Lake'],
    rules: [
      'Stay up to 10 days in any 30 days from May 1 to Sept. 15, and 16 days the rest of the year. Confirm with the Stanley office',
      'Store all food, scented items and trash in a closed hard-sided vehicle or trailer. Pickup beds and coolers do not count',
      'Check current fire restrictions before any campfire. Some sites have fire rings',
      'Pack out all trash',
    ],
    directions:
      'Come in from the west end, off ID-21 on the northwest side of Stanley, and cross the bridge onto Nip and Tuck Road (FR 653). The best sites are 2.5 to 3 miles in. Big rigs should stay on the lower sections near ID-21. Avoid the east end from ID-75 in Lower Stanley: it has a deep, narrow wash.',
    phone: '(208) 774-3000', // Contact listed on The Dyrt (Stanley area office)
    // Not in the data model yet: about 6,430 ft elevation; good T-Mobile signal reported.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Nip & Tuck Road Dispersed Camping',
        url: 'https://maps.campendium.com/us/stanley-id/nature/nip-tuck-road-dispersed-camping',
      },
      {
        label: 'The Dyrt: Nip and Tuck Rd Dispersed Camping',
        url: 'https://www.thedyrt.com/camping/idaho/dispersed-camping-on-nip-and-tuck-rd-near-stanley-idaho',
      },
      {
        label: 'Forest Service: Sawtooth NRA occupancy and use order (2020)',
        url: 'https://fs.usda.gov/Internet/FSE_DOCUMENTS/fseprd852025.pdf',
      },
      {
        label: 'Forest Service: Sawtooth NRA dispersed camping rules',
        url: 'https://fs.usda.gov/Internet/FSE_DOCUMENTS/fseprd547101.pdf',
      },
      {
        label: 'KMVT: Sawtooth National Forest camping rule changes',
        url: 'https://www.kmvt.com/2021/04/12/sawtooth-national-forest-camping-rule-changes',
      },
    ],
  },

  // ── Goodland, Kansas ────────────────────────────────────────────────────

  {
    id: 'goodland-koa',
    name: 'Goodland KOA Journey',
    latitude: 39.33687, // KOA's map pin
    longitude: -101.6976,
    siteType: 'campground',
    landManager: 'KOA (private) · Goodland KOA Journey',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: on the US-24 business loop just off I-70
      drivetrain: '2wd-ok',
      surface: 'On the US-24 business loop, 3/4 mile north of I-70',
      impassableWhenWet: false, // ASSUMPTION: highway-side campground
    },
    fit: {
      tent: true, // Tent sites with fire ring and picnic table
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 95, // KOA description: pull-throughs up to 95 ft (amenities list says 100 ft)
      bigRig: true, // Pull-throughs well over 60 ft
      turnaround: true, // Pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric', 'water', 'sewer'], // Full-hookup pull-throughs with 30/50 amp; water-and-electric sites too
      reservations: 'reservable',
      notes: 'Prices vary by date and site; check koa.com. Open all year, with well-lit after-hours check-in.',
    },
    amenities: [
      'Pool (seasonal)',
      'Wi-Fi',
      'Laundry',
      'Camp store',
      'Dog park',
      'Snack bar',
      'Camping cabins',
      'Tent sites with fire ring and picnic table',
    ],
    rules: ['Check-in 1:30 p.m., check-out 11:00 a.m.', 'Pets welcome; see KOA pet policy'],
    directions:
      'Take I-70 Exit 19, then go north 3/4 mile on the US-24 business loop. The KOA sign is on your right, at 1114 East US Highway 24.',
    phone: '(785) 890-5701',
    verified: false,
    reportCount: 0,
    sources: [{ label: 'KOA: Goodland KOA Journey', url: 'https://koa.com/campgrounds/goodland/' }],
  },

  // ── Osage County, Kansas ────────────────────────────────────────────────

  {
    id: 'osage-state-fishing-lake',
    name: 'Osage State Fishing Lake',
    latitude: 38.76526, // The Dyrt
    longitude: -95.67388,
    siteType: 'dispersed',
    landManager: 'Kansas Dept. of Wildlife and Parks · Osage State Fishing Lake and Wildlife Area',
    stayLimitDays: 7, // KDWP area brochure: 7 consecutive days
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Well-maintained gravel lake roads. A 43 ft RV drove in easily (Apr 2025)',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // "Easy in for a Ford Transit" (Sep 2025)
      maxTrailerFt: null,
      bigRig: true, // 43 ft RV "navigated smoothly" (Apr 2025)
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0, // KDWP: no camping fees
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free primitive lakeside camping. Two pit toilets and a boat ramp. No water or trash service, so take your trash with you. A fishing license is needed only if you fish.',
    },
    amenities: ['Pit toilets', 'Boat ramp', 'Fishing', 'Fire rings at some sites', 'Bird watching on the east side'],
    rules: [
      'Stay up to 7 days in a row',
      'Camp only in the maintained camping areas. No camping on the east side of the lake (posted)',
      'No alcohol and no swimming',
      'No off-road vehicles or horses',
      'Take all trash with you',
    ],
    directions:
      'In north-central Osage County between US-75 and US-56, near Scranton and Carbondale, about 15 minutes south of Topeka. Sites line the lake shore.',
    phone: '(785) 273-6740', // KDWP Region 2 office
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'KDWP: Osage State Fishing Lake',
        url: 'https://kdwpt.ks.gov/KDWP-Info/Locations/State-Fishing-Lakes/Southeast-Region/Osage',
      },
      {
        label: 'KDWP: Osage SFL & WA map and rules',
        url: 'https://ksoutdoors.gov/content/download/9794/51289/version/7/file/OSAGE+SFL+%26+WA.pdf',
      },
      {
        label: 'The Dyrt: Osage State Fishing Lake',
        url: 'https://thedyrt.com/camping/kansas/osage-state-fishing-lake',
      },
      {
        label: 'Boondockers Bible: Free camping at Kansas state fishing lakes',
        url: 'https://boondockersbible.com/?p=20530',
      },
    ],
  },

  // ── West Yellowstone, Montana ───────────────────────────────────────────

  {
    id: 'west-fork-denny-creek-west-yellowstone',
    name: 'West Fork Denny Creek near West Yellowstone',
    latitude: 44.69404, // Campendium
    longitude: -111.26409,
    siteType: 'dispersed',
    landManager: 'Custer Gallatin National Forest · Hebgen Lake Ranger District',
    stayLimitDays: 16, // 16 days in a row at one site, 32 days a year in all (Forest Service order R1-2025-01)
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok', // RVs reach the first sites; the steep right fork needs high clearance
      surface:
        'Rough, narrow dirt with deep potholes and ruts and few places to pass. The steep right fork past the sites is high clearance only',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: null,
      bigRig: null, // A 44 ft rig was reported in 2022, but the Forest Service says RV access is limited in this area
      turnaround: false, // "One way in and one way out" — have good backing skills or scout ahead (Aug 2024)
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free numbered sites, first come, first served. No water, toilets or trash service. Bear-proof trash bins are in West Yellowstone. Arrive early in summer.',
    },
    amenities: ['Close to Yellowstone’s West Entrance and Hebgen Lake'],
    rules: [
      'Camp only at the numbered sites. Signs say no camping past site 4',
      'Grizzly country: store food, trash and scented items in a hard-sided vehicle or bear-resistant container (March 1 to Dec. 1)',
      'Stay up to 16 days in a row at one site and 32 days a year in all on Montana national forests',
      'Check current fire restrictions before any campfire',
      'Pack out all trash',
    ],
    directions:
      'From West Yellowstone, drive about 7 to 8 miles west on US-20 and turn north on Denny Creek Road. The sites are on West Denny Creek Road (FR 1735). A camper says to stay right at each fork with the creek on your right; site 1 is on the left just before the creek crossing and the others are past it. The left fork ends at a locked gate.',
    phone: '(406) 823-6961', // Hebgen Lake Ranger District, for dispersed camping questions
    // Not in the data model yet: about 6,790 ft elevation.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: West Fork Denny Creek Dispersed Camping',
        url: 'https://maps.campendium.com/us/west-yellowstone-mt/camping-rv/west-fork-denny-creek-dispersed-camping',
      },
      {
        label: 'Forest Service: Custer Gallatin visitor information (May 2026)',
        url: 'https://www.fs.usda.gov/media/268345',
      },
      {
        label: 'Forest Service: Northern Region camping stay limits (R1-2025-01)',
        url: 'https://www.fs.usda.gov/r01/alerts/r1-2025-01-camping-stay-limits-prohibitions-pallets-and-refuse-use-target-shooting',
      },
      {
        label: 'Forest Service: Custer Gallatin food storage order',
        url: 'https://www.fs.usda.gov/r01/custergallatin/alerts/food-storage-order',
      },
      {
        label: 'Forest Service: Cherry Creek Campground (Hebgen Lake District)',
        url: 'https://fs.usda.gov/r01/custergallatin/recreation/cherry-creek-campground',
      },
    ],
  },

  {
    id: 'yellowstone-park-west-gate-koa',
    name: 'Yellowstone Park / West Gate KOA Holiday',
    latitude: 44.68681, // Campendium; matches KOA's posted GPS (N44.686, W111.2179)
    longitude: -111.217,
    siteType: 'campground',
    landManager: 'KOA (private) · Yellowstone Park / West Gate KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: right on US-20
      drivetrain: '2wd-ok',
      surface: 'Right on US-20 (Targhee Pass Highway). Some sites are gravel and a bit uneven',
      impassableWhenWet: false, // ASSUMPTION: highway-side campground
    },
    fit: {
      tent: true, // Three kinds of tent sites plus tent villages
      rtt: true, // KOA says rooftop tents are accepted
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 77, // KOA amenities list: 77 ft max length
      bigRig: true, // KOA mentions big-rig friendly sites
      turnaround: true, // Pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric', 'water', 'sewer'], // Full hookups listed (Campendium); not every site has sewer
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. Campers reported paying $151 to $165 a night for RV sites in summer 2024. Open May 19 to Oct. 1, with fewer services in fall.',
    },
    amenities: [
      'Heated indoor pool (summer)',
      'Wi-Fi',
      'Cable TV',
      'Laundry',
      'Camp store',
      'Dog park',
      'Propane',
      'Firewood',
      'Café and coffee cabin',
      'Bike rentals',
      'Playground',
      'Yellowstone tour pickups',
    ],
    rules: [
      'RV and tent sites: check-in 1:00 p.m., check-out 11:00 a.m.',
      'Cabins: check-in 3:00 p.m., check-out 11:00 a.m.',
      'Pets welcome at pet-friendly sites; see KOA pet policy',
    ],
    directions:
      'On US-20 about 6 miles west of Yellowstone’s West Entrance, at 3305 Targhee Pass Highway. From Idaho it is about 3 miles east of the state line. The Mountainside KOA is 1.5 miles farther west; don’t mix them up.',
    phone: '(406) 646-7606',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Yellowstone Park / West Gate KOA Holiday', url: 'https://koa.com/campgrounds/yellowstone-park/' },
      {
        label: 'Campendium: Yellowstone Park - West Gate KOA Holiday',
        url: 'https://maps.campendium.com/us/west-yellowstone-mt/camping-rv/yellowstone-park-west-gate-koa-holiday',
      },
    ],
  },

  // ── Pine Ridge, Nebraska ────────────────────────────────────────────────

  {
    id: 'pine-ridge-fr-714a-chadron',
    name: 'Pine Ridge Forest Road 714A near Chadron',
    latitude: 42.70981, // Campendium
    longitude: -103.03805,
    siteType: 'dispersed',
    landManager: 'Nebraska National Forest · Pine Ridge Ranger District',
    stayLimitDays: 14, // 14 days in a row, then leave for 14 days (Forest Service guide)
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'About 1.5 miles of one-lane dirt along the ridge. Reported in good shape, but there are hidden ditches on both sides and few places to pass',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 26, // A 26 ft travel trailer camped here (The Dyrt review, about 2020); longest rig reported 33 ft
      bigRig: false, // "The turnaround at the trailhead is pretty tight" for longer trailers (May 2026)
      turnaround: null, // Tight turnaround at the trailhead at the end of the road
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free camping, but you drive through Chadron State Park to get here, which needs a Nebraska park entry permit: $7.35/day with Nebraska plates or $14.35/day with other plates (2026). Water and a dump station are in the state park.',
    },
    amenities: ['Black Hills Overlook views', 'Trailheads at both ends of the road', 'Chadron State Park nearby'],
    rules: [
      'Stay up to 14 days in a row, then leave for 14 days',
      'Camp beside the road. Side spurs are closed to motor vehicles',
      'Fire restrictions were posted for the Pine Ridge in fall 2026. Check before any campfire',
      'Pack it in, pack it out. Bury human waste 6 inches deep and 100 feet from water',
    ],
    directions:
      'Drive into Chadron State Park on US-385 near Chadron and head to its western edge, where Forest Road 714A climbs to the Black Hills Overlook trailhead. Only a few sites fit vehicles, so most campers park right along the road. Campers say Google Maps directions can fail here.',
    phone: '(308) 432-0300', // Pine Ridge Ranger District / Supervisor's Office, Chadron
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Pine Ridge Dispersed Camping',
        url: 'https://maps.campendium.com/us/chadron-ne/camping-rv/pine-ridge-dispersed-camping',
      },
      { label: 'The Dyrt: review of FR 714A boondocking', url: 'https://thedyrt.com/review/66307' },
      {
        label: 'Forest Service: Nebraska National Forest, Pine Ridge',
        url: 'https://fs.usda.gov/r02/nebraska/recreation/nebraska-national-forest-pine-ridge-chadron',
      },
      {
        label: 'Guide to the Nebraska National Forests and Grassland',
        url: 'https://discovernwnebraska.com/wp-content/uploads/2021/01/A-Guide-to-the-Nebraska-National-Forests-and-Grassland.pdf',
      },
      {
        label: 'Nebraska Game and Parks: permit pricing',
        url: 'https://outdoornebraska.gov/permits/permit-pricing/',
      },
    ],
  },

  // ── Medora, North Dakota ────────────────────────────────────────────────

  {
    id: 'scoria-pit-medora',
    name: 'Scoria Pit Dispersed Camping near Medora',
    latitude: 46.94544, // Campendium
    longitude: -103.58862,
    siteType: 'dispersed',
    landManager: 'Dakota Prairie Grasslands · Little Missouri National Grassland · Medora Ranger District',
    stayLimitDays: 14, // 14 days in a row at one site, 28 days a year in all (order R1-2025-01)
    access: {
      clearanceTier: 3, // Lower sites are easy; a divot at the entrance and a steep climb to the upper sites
      drivetrain: '2wd-ok', // Fine for the lower sites; a camper advised 4WD for the upper sites (Jun 2026)
      surface:
        'Maintained gravel, then a steep, one-lane S-curve climb with blind spots to the upper sites (6 and up). Muddy at the entrance after rain',
      impassableWhenWet: null, // Campers advise against trailers and big RVs after rain
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 35, // A 35 ft fifth wheel used site 5 with no issues (Aug 2025); a 45 ft toy hauler was reported (Aug 2026)
      bigRig: true, // A 38 ft Class A towing a van called it an "easy road" (Aug 2026). Big rigs use the lower sites
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. About 14 to 20 numbered sites, first come, first served, and often full by mid-afternoon. No water, toilets or trash service. Fill water and dump in Medora.',
    },
    amenities: ['Badlands views', 'Close to Theodore Roosevelt National Park and Medora'],
    rules: [
      'Camp only at the numbered sites. Don’t make new sites',
      'Stay up to 14 days in a row and 28 days a year in all',
      'Check Dakota Prairie Grasslands fire restrictions before any fire. Campers disagree on whether fires are allowed here',
      'Stay away from oil and gas well sites, fenced or not',
      'The area can close for special events. Check Forest Service alerts before you go',
    ],
    directions:
      'A few miles northwest of Medora off West River Road, near I-94 Exit 23. Exit 23 has no westbound on-ramp, so go east to Exit 24 to turn around. Big rigs should take the lower sites and go slow on the hill.',
    phone: '(701) 227-7800', // Medora Ranger District, Dickinson
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Scoria Pit Dispersed Camping',
        url: 'https://maps.campendium.com/us/medora-nd/camping-rv/scoria-pit-dispersed-camping',
      },
      {
        label: 'The Dyrt: Scoria Pit Dispersed Camping',
        url: 'https://thedyrt.com/camping/north%20dakota/scoria-pit-dispersed-camping',
      },
      {
        label: 'Forest Service: Dispersed camping on the grasslands',
        url: 'https://www.fs.usda.gov/r01/dpg/recreation/dispersed-camping-grasslands',
      },
      {
        label: 'Forest Service: Northern Region camping stay limits (R1-2025-01)',
        url: 'https://www.fs.usda.gov/r01/alerts/r1-2025-01-camping-stay-limits-prohibitions-pallets-and-refuse-use-target-shooting',
      },
      {
        label: 'Forest Service: Medora Ranger District',
        url: 'https://www.fs.usda.gov/r01/dpg/offices/medora-ranger-district',
      },
    ],
  },

  // ── Badlands, South Dakota ──────────────────────────────────────────────

  {
    id: 'pinnacles-nomad-view-wall',
    name: 'Pinnacles Dispersed Area (Nomad View) near Wall',
    latitude: 43.893, // Forest Service
    longitude: -102.22897,
    siteType: 'dispersed',
    landManager: 'Buffalo Gap National Grassland · Wall Ranger District',
    stayLimitDays: 14,
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Gravel and dirt grassland roads, bumpy and dusty. Turns to slick mud in rain',
      impassableWhenWet: true, // Forest Service: avoid driving when wet; "very muddy" after rain (Jun 2026)
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: null,
      bigRig: null, // Longest reported 34 ft (Class C towing a Jeep, May 2026); some sites need leveling
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. About 70 sites marked with wooden posts along the Badlands rim, first come, first served. Often full by late afternoon in summer. No water, toilets or trash. Use private dump stations nearby.',
    },
    amenities: ['Badlands rim views', 'Close to Badlands National Park and Wall'],
    rules: [
      'Camp only at a numbered post, on the side of the road away from the rim',
      'Stay up to 14 days',
      'Keep off fenced restoration areas, and don’t camp in the day-use parking',
      'Drive only on roads shown on the Motor Vehicle Use Map. Avoid driving when wet',
      'Check fire restrictions at blackhillsfirerestrictions.com before any fire',
      'Pets must be leashed or under voice control. Cattle graze here May to September',
    ],
    directions:
      'About 6 miles south of Wall off SD-240. Take Forest Roads 7158 and 7170 to the numbered posts; campers say the turn is by the radio towers. High winds and storms come up fast, so stay back from the crumbly rim.',
    phone: '(605) 279-2126', // Wall Ranger District
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Forest Service: Pinnacles Dispersed Camping Area',
        url: 'https://www.fs.usda.gov/r02/nebraska/recreation/pinnacles-dispersed-camping-area',
      },
      {
        label: 'Campendium: Nomad View Dispersed Camping',
        url: 'https://maps.campendium.com/us/wall-sd/places/nomad-view-dispersed-camping',
      },
      {
        label: 'The Dyrt: Buffalo Gap Dispersed Camping (The Wall)',
        url: 'https://thedyrt.com/camping/south-dakota/the-wall-dispersed-camping-just-outside-badlands',
      },
      {
        label: 'Black Hills Parks & Forests: Pinnacles restoration',
        url: 'https://blackhillsparks.org/pinnacles-camping-restoration/',
      },
    ],
  },

  // ── Black Hills, South Dakota ───────────────────────────────────────────

  {
    id: 'mount-rushmore-koa-palmer-gulch',
    name: 'Mount Rushmore KOA Resort at Palmer Gulch',
    latitude: 43.9017, // KOA's posted GPS
    longitude: -103.53629,
    siteType: 'campground',
    landManager: 'KOA (private) · Mount Rushmore KOA Resort at Palmer Gulch',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: on paved SD-244
      drivetrain: '2wd-ok',
      surface: 'On paved SD-244 between Hill City and Mount Rushmore',
      impassableWhenWet: false, // ASSUMPTION: highway-side resort
    },
    fit: {
      tent: true, // Premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 90, // KOA: 90 ft max length
      bigRig: true, // KOA: "Bring the big rig"; 90 ft max length
      turnaround: true, // Pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric', 'water', 'sewer'], // Full-hookup pull-through and back-in sites, up to 50 amp
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. Open May 1 to Oct. 1. Campers say many amenities close after Labor Day.',
    },
    amenities: [
      'Pool and waterslide (seasonal)',
      'Hot tub and sauna',
      'Showers',
      'Laundry',
      'Wi-Fi',
      'Camp store',
      'Propane',
      'Firewood',
      'Pet area',
      'Mini golf',
      'Horseback riding',
      'Deluxe and camping cabins',
    ],
    rules: [
      'RV and tent sites: check-in 1:00 p.m., check-out 11:00 a.m.',
      'Cabins: check-in 3:00 p.m., check-out 11:00 a.m.',
      'Pets welcome; see KOA pet policy',
    ],
    directions:
      'From I-90 Exit 61, take US-16 west 25 miles to Hill City, continue 3 miles on US-16/385, then turn left on SD-244 and go 3.5 miles to 12620 Highway 244. KOA says GPS directions here are wrong.',
    phone: '(605) 574-2525',
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'KOA: Mount Rushmore KOA Resort at Palmer Gulch',
        url: 'https://koa.com/campgrounds/mount-rushmore/',
      },
    ],
  },

  // ── Grand Teton area (Jackson), Wyoming ─────────────────────────────────

  {
    id: 'shadow-mountain-jackson',
    name: 'Shadow Mountain Designated Sites near Grand Teton',
    latitude: 43.70004, // The Dyrt
    longitude: -110.62616,
    siteType: 'dispersed',
    landManager: 'Bridger-Teton National Forest · Jackson Ranger District',
    stayLimitDays: 5, // 5 days in any 30, May 1 to Labor Day (order 04-03-24-204); 14 in 30 the rest of the year
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok', // A low Civic reached site 5 (Aug 2025); the upper loop needs high clearance and 4WD when wet
      surface:
        'Paved to the camping area entrance, then rutted, rocky dirt. Low cars can reach the lower sites. The summit loop is rough and turns to mud in rain',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // A Sprinter handled the road (2023)
      maxTrailerFt: null, // Pop-ups and small trailers are common; a 30 ft trailer struggled on the first stretch (2024)
      bigRig: false, // Campers advise against big rigs or heavy towing
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. About 50 numbered sites, first come, first served, often full by late morning in summer. A sign at the turnoff shows when it’s full. Vault toilets at the base, no water.',
    },
    amenities: ['Vault toilets at the base', 'Steel fire rings at most sites'],
    rules: [
      'Camp only at marked, numbered sites',
      'Stay up to 5 days in any 30 days from May 1 to Labor Day',
      'Grizzly and black bear country: store food and scented items in a hard-sided vehicle',
      'Have at least 5 gallons of water and a shovel before you light a campfire',
      'A camp ambassador patrols in summer',
    ],
    directions:
      'From Jackson, take US-26/89 north 13.3 miles. Turn right on Antelope Flats Road, go 3.3 miles to the stop sign, and turn left to reach the camping area near Kelly. Lower sites fill first; the summit loop is rough.',
    phone: '(307) 739-5400', // Jackson Ranger District
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'The Dyrt: Shadow Mountain Dispersed Camping',
        url: 'https://thedyrt.com/camping/wyoming/shadow-mountain-dispersed-camping',
      },
      {
        label: 'Forest Service: Bridger-Teton camping',
        url: 'https://www.fs.usda.gov/r04/bridger-teton/recreation/camping-cabins',
      },
      {
        label: 'Forest Service: 5-day stay limit order',
        url: 'https://fs.usda.gov/r04/bridger-teton/alerts/camping-5-day-stay-limit-jackson-blackrock-big-piney-greys-river-ranger',
      },
      {
        label: 'Visit Jackson Hole: Camping at Designated Sites',
        url: 'https://visitjacksonhole.com/wp-content/uploads/2025/05/Camping-at-Designated-Sites_trifold.pdf',
      },
      { label: 'Bridger-Teton Friends: camping guide', url: 'https://www.btfriends.org/guides/camping' },
    ],
  },

  // ── Vedauwoo (I-80 between Cheyenne and Laramie), Wyoming ───────────────

  {
    id: 'vedauwoo-fr-700',
    name: 'Vedauwoo Designated Dispersed Sites (FR 700)',
    latitude: 41.15538, // The Dyrt
    longitude: -105.35393,
    siteType: 'dispersed',
    landManager: 'Medicine Bow National Forest · Laramie Ranger District (Pole Mountain area)',
    stayLimitDays: 16, // Forest Service: 16 days at a given site
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface: 'Washboard gravel with ruts and potholes on the entry road. The spur roads are smoother',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: null, // No posted limit; campers say large trailers make it if you go slow (2025)
      bigRig: null,
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. 97 numbered sites with rock fire rings, first come, first served. No water or trash service. Busy on summer weekends; weekdays are easier.',
    },
    amenities: [
      'Vault toilets at Nautilus Rock Trailhead and on FR 700D',
      'Hiking trails, including the Turtle Rock loop',
      'Beaver ponds',
    ],
    rules: [
      'Camp only at numbered sites. Keep vehicles and fires within 50 feet of the site marker',
      'Stay up to 16 days at a site',
      'No more than 2 vehicles per site. Groups over 8 must use a group site',
      'Pack out all trash and human and pet waste',
      'Check Medicine Bow fire restrictions before any campfire',
      'The road is closed to vehicles about February through May',
    ],
    directions:
      'Take I-80 Exit 329 (Vedauwoo), about 16 miles east of Laramie or 30 miles west of Cheyenne. Take FR 700 (left from Laramie, right from Cheyenne) and drive about 2 miles east. It’s often windy, and cattle graze here.',
    phone: '(307) 745-2300', // Medicine Bow-Routt Supervisor's Office and Laramie Ranger Station, Laramie
    // Not in the data model yet: good Verizon signal reported.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Forest Service: Vedauwoo Designated Dispersed Campsites',
        url: 'https://www.fs.usda.gov/r02/mbrtb/recreation/vedauwoo-designated-dispersed-campsites',
      },
      {
        label: 'The Dyrt: Forest Service Road 700 Designated Dispersed Camping',
        url: 'https://thedyrt.com/camping/undefined/dispersed-camping-vedauwoo-road',
      },
    ],
  },
];
