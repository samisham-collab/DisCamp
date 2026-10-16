import type { Spot } from '../../types';

// Starter spots for the Central and Eastern US. Researched October 2026.
// Dispersed camping is rarer in the East, so most of these are National
// Forest sites, several of them numbered or signed sites where the forest
// allows camping only there.

export const EAST_SPOTS: Spot[] = [
  // ── Ozarks, Arkansas ───────────────────────────────────────────────────

  {
    id: 'morgan-mountain-road-spy-rock-ozark',
    name: 'Morgan Mountain Road near Spy Rock',
    latitude: 35.69309, // The Dyrt
    longitude: -93.76761,
    siteType: 'dispersed',
    landManager: 'Ozark National Forest · Pleasant Hill Ranger District',
    // Ozark-St. Francis order 08-10-00-22-135 (in effect through Dec 31, 2026):
    // 30 consecutive days in the general forest area, 90 days a year.
    stayLimitDays: 30,
    access: {
      // "A 2wd passenger car can carefully make it over the eroded areas" (Nov 2024).
      // Small SUVs and an AWD Equinox made it in 2025 by going slowly.
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface: 'Gravel and dirt forest road with erosion ruts, worse after rain and ATV traffic. Go slow; AWD helps',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // rented camper van, Nov 2025
      maxTrailerFt: 20, // The Dyrt lists RVs up to 20 ft
      bigRig: false, // ASSUMPTION: listed for RVs up to 20 ft; only part of the area is level
      turnaround: true, // "Plenty of space to turn a truck and trailer around" (May 2026)
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free dispersed camping. No water, toilets or trash service.',
    },
    amenities: ['Rock fire ring', 'Spy Rock overlook and Redding Loop Trail nearby', 'Mulberry River nearby'],
    rules: [
      'Stay up to 30 days in a row, then move your camp at least 1 mile away for 14 days',
      'No more than 90 days a year camping in the general forest area',
      'Check county burn bans and fire danger before you light a fire',
      'Pack out all trash',
      'Bears live here: store food in your vehicle',
    ],
    directions:
      'From I-40 exit 35 at Ozark, take AR 23 north about 15 miles to just past Cass, then turn east on AR 215 toward Redding Recreation Area. Morgan Mountain Road (FR 1504) heads north from AR 215; the campsite is a large clearing a little over a mile up, set 30–40 yards off the road. Only part of it is level. Farther north, a landslide closed FR 1504 between Lumpkin Creek Road (FR 1538) and Beech Grove Road (FR 1533) in 2025; this spot is south of that stretch.',
    phone: '(479) 754-2864', // Pleasant Hill Ranger District, Clarksville (FS Redding page)
    // Not in the data model yet: Verizon good (12 camper reports), AT&T some,
    // T-Mobile mixed. About 3–4 rigs fit.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'The Dyrt: Morgan Mtn Rd/Spy Rock Dispersed',
        url: 'https://thedyrt.com/camping/arkansas/morgan-mtn-rd-spy-rock-dispersed-ozark-national-forest-ar',
      },
      {
        label: 'Forest Service: Morgan Mtn Rd partially closed for road repair',
        url: 'https://www.fs.usda.gov/r08/ozark-stfrancis/alerts/morgan-mtn-rd-partially-closed-road-repair',
      },
      {
        label: 'Forest Service: Ozark-St. Francis occupancy and use order',
        url: 'https://fs.usda.gov/r08/ozark-stfrancis/alerts/forest-order-occupancy-and-use',
      },
      {
        label: 'Forest Service: Redding Recreation Area',
        url: 'https://www.fs.usda.gov/r08/ozark-stfrancis/recreation/redding-recreation-area',
      },
      {
        label: 'onX Offroad: Morgan Mountain Road',
        url: 'https://www.onxmaps.com/offroad/trails/us/arkansas/morgan-mountain-road-jn2qvd2xxq95',
      },
      {
        label: 'Ark-Ok Hiker: Redding Loop/Spy Rock Trail',
        url: 'https://arkokhiker.org/west-ark/redding-loop-spy-rock-hike-ozark-forest/',
      },
    ],
  },

  {
    id: 'harrison-koa-holiday',
    name: 'Harrison KOA Holiday',
    latitude: 36.28306, // koa.com (Google Directions link)
    longitude: -93.16708,
    siteType: 'campground',
    landManager: 'KOA (private) · Harrison KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: on US 65; campground roads not described
      drivetrain: '2wd-ok',
      surface: null,
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 97, // KOA's listed max site length
      bigRig: true, // 97 ft max length, pull-through full-hookup sites
      turnaround: true, // pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric', 'water', 'sewer'], // "Full Hook-Up" pull-throughs, 50 amp
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. The listing showed no site prices in October 2026. Open all year.',
    },
    amenities: [
      'Wi-Fi',
      'Cable TV',
      'Pool (late May through October)',
      'Snack bar',
      'Propane',
      'Firewood for sale',
      'Kamping Kitchen',
      'Mini golf',
      'Game room',
      'Playground',
      'Pavilion',
      'Cabins',
    ],
    rules: [
      'RV and tent sites: check in 1 pm, check out 11 am',
      'Cabins: check in 3 pm, check out 11 am',
      "Read KOA's pet policy before you bring pets",
    ],
    directions:
      '3629 Highway 65 North, Harrison, AR 72601. On US 65 on the north side of Harrison, in the Ozarks near the Buffalo National River.',
    phone: '(870) 743-2267',
    verified: false,
    reportCount: 0,
    sources: [{ label: 'KOA: Harrison KOA Holiday', url: 'https://koa.com/campgrounds/harrison/' }],
  },

  // ── Straits of Mackinac, Michigan ──────────────────────────────────────

  {
    id: 'search-bay-hiawatha',
    name: 'Search Bay Dispersed near Hessel',
    latitude: 45.99355, // The Dyrt
    longitude: -84.5158,
    siteType: 'dispersed',
    // ASSUMPTION: district from the location (Mackinac County, east of St. Ignace)
    landManager: 'Hiawatha National Forest · St. Ignace/Sault Ste. Marie Ranger District',
    // Hiawatha NF guidance (2016 news release): up to 16 days in a row at one spot
    stayLimitDays: 16,
    access: {
      // Potholed two-track with mud holes, ruts and low branches. A 2WD Tacoma
      // was fine (May 2025); "the road to the best campsites does require a
      // higher clearance vehicle" (Jul 2026).
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface:
        'Potholed two-track through cedar forest, with mud holes, ruts and low branches. Higher clearance helps for the shoreline sites',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // Sprinter vans, 2024 and 2026 (a 20 ft Sprinter couldn't reach the last two sites)
      maxTrailerFt: null, // a Pilot towing a Shasta trailer made it (Jun 2026); length not given
      bigRig: false, // a 26 ft Class C found "no place" (Oct 2023)
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free dispersed camping. No water, toilets or trash service.',
    },
    amenities: ['Lake Huron shoreline', 'Fire rings at many sites'],
    rules: [
      'Camp off the beach: Forest Service staff asked a camper on the beach to move (Aug 2025)',
      'Hiawatha NF has allowed up to 16 days in a row at one spot; check with the district',
      "Don't leave gear unattended more than 24 hours",
      'Park within 25 feet of the road',
      'Pack out all trash, and never leave food scraps on the ground',
    ],
    directions:
      'On the Lake Huron shore of Search Bay, just west of Hessel and about 13 miles from St. Ignace. A potholed two-track runs along the shore with sites on both sides. Sites near the entrance can take small RVs; past that, stick to vans, truck campers and small rigs (an 18 ft Class B with a kayak trailer was about the limit). Bring bug spray in late spring and early summer.',
    phone: '(906) 643-7900', // St. Ignace/Sault Ste. Marie Ranger District office, St. Ignace
    // Not in the data model yet: Verizon 1–3 bars, AT&T inconsistent, T-Mobile
    // spotty (camper reports through Oct 2026). Gets busy in July and August.
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'The Dyrt: Search Bay Dispersed', url: 'https://thedyrt.com/camping/michigan/search-bay-dispersed' },
      {
        label: 'Forest Service: St. Ignace/Sault Ste. Marie Ranger District',
        url: 'https://www.fs.usda.gov/r09/hiawatha/offices/hiawatha-national-forest-st-ignace-sault-ste-marie-ranger-district',
      },
      {
        label: 'WLUC: Hiawatha National Forest welcomes hunters (camping rules)',
        url: 'https://www.uppermichiganssource.com/content/news/Hiawatha-National-Forest-welcomes-hunters--399895191.html',
      },
    ],
  },

  {
    id: 'st-ignace-mackinac-island-koa-holiday',
    name: 'St. Ignace / Mackinac Island KOA Holiday',
    latitude: 45.85392, // koa.com
    longitude: -84.77386,
    siteType: 'campground',
    landManager: 'KOA (private) · St. Ignace / Mackinac Island KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: on US 2; campground roads not described
      drivetrain: '2wd-ok',
      surface: null,
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // tent sites and premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 80, // KOA's listed max length
      bigRig: true, // 80 ft max length, 50 amp
      turnaround: null, // pull-through sites not mentioned
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      // 50 amp on the listing; camper reviews on koa.com mention water hookups.
      // Sewer hookups aren't stated.
      hookups: ['electric', 'water'],
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. The listing showed no site prices in October 2026. Open April 24 to October 25.',
    },
    amenities: [
      'Wi-Fi',
      'Cable TV',
      'Camp store with discounted Mackinac Island ferry tickets',
      'Free shuttle to the Mackinac Island ferry docks',
      'Snack bar',
      'Firewood for sale',
      'Dog park',
      'Mini golf',
      'Jumping pillow',
      'Pavilion',
      'Cabins and glamping tents',
    ],
    rules: [
      'RV and tent sites: check in 1 pm, check out 11 am',
      'Cabins and glamping tents: check in 3 pm, check out 11 am',
      'Open April 24 to October 25',
      "Read KOA's pet policy before you bring pets",
    ],
    directions:
      'W1118 US-2, St. Ignace, MI 49781. From the Mackinac Bridge, take I-75 exit 344B (northbound) or exit 344 (southbound), then go 2.2 miles west on US 2. The campground is on the north side of US 2, between mile markers 2 and 3.',
    phone: '(906) 984-0209', // reservations line on koa.com
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: St. Ignace / Mackinac Island KOA Holiday', url: 'https://koa.com/campgrounds/st-ignace/' },
    ],
  },

  // ── Mark Twain National Forest, Missouri ───────────────────────────────

  {
    id: 'sugar-camp-lookout-tower-mark-twain',
    name: 'Sugar Camp Lookout Tower Dispersed Area',
    latitude: 36.52899, // The Dyrt
    longitude: -93.83313,
    siteType: 'dispersed',
    landManager: 'Mark Twain National Forest · Ava/Cassville/Willow Springs Ranger District',
    stayLimitDays: 14, // 14 days in any 30-day period, forest-wide (order 09-05-20-01)
    access: {
      // "Access road was a little rough, as in your typical dirt road, but posed
      // 0 problems for our little economy car" (Jul 2025)
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Bumpy dirt forest road, rough in spots. Take care after rain',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // rented camper van, Nov 2025
      maxTrailerFt: 30, // The Dyrt lists RVs up to 30 ft
      bigRig: null, // tagged "Big Rig Friendly" but listed for RVs up to 30 ft
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free dispersed camping. No water, toilets or trash service.',
    },
    amenities: ['Picnic table', 'Fire rings'],
    rules: [
      'Stay up to 14 days in any 30 days. After that, no camping anywhere on the Mark Twain until the 30 days are up',
      'Check for burn bans before you light a fire',
      'Pack out all trash',
      'Black bears visit at night: lock up food and trash',
    ],
    directions:
      'A large wooded clearing near the Sugar Camp lookout tower, tucked off the main road on a dirt access road. Room for 4 or more rigs. The nearest town is Eagle Rock, MO; Eureka Springs, AR is about 10 miles away. The pin is from The Dyrt.',
    phone: '(573) 364-4621', // Mark Twain NF Supervisor's Office, Rolla
    // Not in the data model yet: some LTE on Verizon, AT&T and T-Mobile.
    // A black bear came through camp at 2 a.m. (Sep 2026).
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'The Dyrt: Sugar Camp Lookout Tower Dispersed Area',
        url: 'https://thedyrt.com/camping/missouri/radium-springs-firetower-camp',
      },
      {
        label: 'Forest Service: Mark Twain forest-wide conditions of use',
        url: 'https://www.fs.usda.gov/r09/marktwain/alerts/forest-order-09-05-20-01-conditions-use-forest-wide',
      },
      {
        label: 'Forest Service: Ava, Cassville and Willow Springs areas',
        url: 'https://www.fs.usda.gov/r09/marktwain/recreation/ava-cassville-and-willow-springs-areas',
      },
    ],
  },

  // ── White Mountains, New Hampshire ─────────────────────────────────────

  {
    id: 'gale-river-loop-road-white-mountain',
    name: 'Gale River Loop Road roadside sites',
    latitude: 44.2432, // Campendium
    longitude: -71.632,
    siteType: 'dispersed',
    landManager: 'White Mountain National Forest',
    stayLimitDays: 14, // Campendium and iOverlander listings
    access: {
      // "Well-graded dirt road passable by any vehicle" (2017); "Good gravel
      // road" that drains well after heavy rain (iOverlander)
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Graded gravel and dirt road. Narrow side branches; turning around is hard except at the end',
      impassableWhenWet: false, // no trouble leaving after heavy overnight rain (iOverlander)
    },
    fit: {
      tent: true, // sites 4 and 5 are tent-only
      rtt: true,
      van: true,
      maxTrailerFt: null,
      bigRig: true, // 38 ft Class A (Nov 2021) and 33 ft Class A at site 3; the biggest rigs fit only a few sites
      turnaround: null, // hard to turn except at the end of the road
    },
    cost: {
      nightlyFeeUsd: 0, // $0 reported Jul 2025
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free, first come, first served. 13 numbered sites with fire rings. No water, toilets or trash service.',
    },
    amenities: ['Fire ring at each site', 'Gale River nearby', 'Hiking trails within walking distance'],
    rules: [
      'Camp only at the numbered sites. This road is in a Forest Protection Area',
      'Follow the rules posted at each site (campers report 15 people and 3 cars per site)',
      'Stay up to 14 days',
      'Keep pets on a leash',
      'Store food securely: campers have seen bears nearby',
      'Pack it in, pack it out',
    ],
    // US 3 access: the Campendium pin and address (Gale River Trail, Bethlehem)
    // sit between Franconia Notch and Twin Mountain.
    directions:
      'Off US 3 near Bethlehem, between Franconia Notch and Twin Mountain. Sites 1–3 are on the first part of the loop road, tent-only sites 4 and 5 are straight ahead at the crossing, and sites 6–13 are on the right branch. Big rigs should aim for site 3 and avoid dead-end side roads. Sites fill fast in summer and fall, so have a backup. Usually open about May through October; the gate can still be closed in mid-May.',
    phone: '(603) 536-6100', // White Mountain NF Supervisor's Office
    // Not in the data model yet: Verizon 1–2 bars at some sites, AT&T weak or
    // none. Heavy tree cover limits solar. Elevation about 1,345 ft.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Forest Service: White Mountain camping (roadside camping)',
        url: 'https://www.fs.usda.gov/r09/whitemountain/recreation/camping-cabins',
      },
      { label: 'Campendium: Gale River Dispersed', url: 'https://www.campendium.com/gale-river-dispersed/page/2' },
      {
        label: 'iOverlander: Gale River Loop Road',
        url: 'https://app.ioverlander.com/places/151498-gale-river-loop-road',
      },
    ],
  },

  {
    id: 'twin-mountain-mt-washington-koa-holiday',
    name: 'Twin Mountain / Mt. Washington KOA Holiday',
    latitude: 44.30514, // koa.com
    longitude: -71.53288,
    siteType: 'campground',
    landManager: 'KOA (private) · Twin Mountain / Mt. Washington KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: on Route 115; campground roads not described
      drivetrain: '2wd-ok',
      surface: null,
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // wilderness and premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 90, // KOA's listed max length
      bigRig: true, // "Big-Rig friendly 50-amp pull-through RV sites"
      turnaround: true, // pull-through sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric', 'water', 'sewer'], // "full hookups", 50 amp
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. The listing showed no site prices in October 2026. Open May 1 to October 18.',
    },
    amenities: [
      'Showers and restrooms', // camper review on koa.com mentions heated showers
      'Wi-Fi',
      'Cable TV',
      'Pool (late May to early September)',
      'Camp store',
      'Propane',
      'Firewood for sale',
      'Dog park',
      'Playground',
      'Pavilion',
      'Picnic table and fire ring at each site',
      'Cabins and glamping tents',
    ],
    rules: [
      'RV and tent sites: check in 2 pm, check out 11 am',
      'Cabins and lodges: check in 4 pm, check out 11 am',
      'Open May 1 to October 18',
      "Read KOA's pet policy before you bring pets",
    ],
    directions:
      '372 Route 115, Twin Mountain, NH 03595, near the Gale River Loop Road sites. Office hours are 8 am to 8 pm Friday to Sunday and 8 am to 6 pm Monday to Thursday.',
    phone: '(603) 846-5559',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Twin Mountain / Mt. Washington KOA Holiday', url: 'https://koa.com/campgrounds/twin-mountain/' },
    ],
  },

  // ── Allegheny National Forest, Pennsylvania ────────────────────────────

  {
    id: 'clarion-river-campsites-allegheny',
    name: 'Clarion River Campsites',
    latitude: 41.35974, // Forest Service
    longitude: -79.00694,
    siteType: 'dispersed',
    landManager: 'Allegheny National Forest · Marienville Ranger District',
    stayLimitDays: 14, // 14 days in any 30-day period
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Gravel River Road with light traffic. Each site has a hardened parking spot',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: null, // site C10 has "room for probably up to 30' RV" (May 2026)
      bigRig: false, // ASSUMPTION: only some sites fit RVs around 30 ft, and they go fast
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. 27 numbered primitive sites (18 along the Clarion River, 9 along Millstone Creek), first come, first served. No drinking water or picnic tables.',
    },
    amenities: [
      'Rock fire ring at each site',
      'Vault toilets at the Irwin Run, Robin Island and Millstone Creek launches', // open Apr 1 to Nov 1
      'Clarion Wild and Scenic River: paddling and fishing',
    ],
    rules: [
      'Camp only at the numbered sites; no other camping in this area',
      "Occupy your site the first night and every 24 hours after. Leaving gear doesn't hold a site",
      'Stay up to 14 days in any 30 days, then leave the Allegheny NF until the 30 days are up',
      'Up to 8 people per site',
      'Fires only in the fire ring. Burn dead and down wood, and only firewood from Warren, McKean, Forest or Elk County',
      'Dogs on a 6 ft leash, and inside the tent at night',
      "Pack out all trash. Don't burn trash in the fire rings",
    ],
    directions:
      'Along River Road and Millstone Road (FR 132) between Irwin Run and Millstone Creek. From Marienville, take South Forest Street (SR 3002) about 6 miles to Loleta, cross Millstone Creek and turn onto Millstone Road. From Cook Forest, take River Road east from PA 36. From I-80, take exit 73 (eastbound) or 78 (westbound) and follow signs to PA 949 and River Road. A kiosk on River Road maps the sites. Park on the hardened spot, no more than 50 feet from the road.',
    phone: '(814) 927-6628', // Marienville Ranger District
    // Not in the data model yet: no cell service on any carrier (camper reports, 2026).
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Forest Service: Clarion River Campsites',
        url: 'https://www.fs.usda.gov/r09/allegheny/recreation/clarion-river-campsites',
      },
      {
        label: 'Forest Service: Allegheny occupancy limits order',
        url: 'https://www.fs.usda.gov/r09/allegheny/alerts/forest-order-09-19-17-01-occupancy-limits',
      },
      {
        label: 'The Dyrt: Clarion River Campground',
        url: 'https://thedyrt.com/camping/pennsylvania/clarion-river-campground',
      },
      {
        label: 'The Dyrt: Millstone Creek Campground',
        url: 'https://thedyrt.com/camping/pennsylvania/millstone-creek-campground',
      },
    ],
  },

  // ── Great Smoky Mountains, Tennessee ───────────────────────────────────

  {
    id: 'gatlinburg-east-smoky-mountain-koa-holiday',
    name: 'Gatlinburg East / Smoky Mountain KOA Holiday',
    latitude: 35.77464, // koa.com map marker
    longitude: -83.25901,
    siteType: 'campground',
    landManager: 'KOA (private) · Gatlinburg East / Smoky Mountain KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1, // ASSUMPTION: on Hooper Highway; campground roads not described
      drivetrain: '2wd-ok',
      surface: null,
      impassableWhenWet: null,
    },
    fit: {
      tent: true, // tent sites with sand tent pads and bear boxes
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 100, // KOA lists a 120 ft max length; 100 is the most the app stores
      bigRig: true, // 120 ft max length, 50 amp
      turnaround: true, // pull-thru sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: 60, // "as low as $60"
      hookups: ['electric', 'water', 'sewer'], // "full hookups"
      reservations: 'reservable',
      notes: 'Prices vary by date and site; check koa.com. Lowest RV site price seen October 2026: $60. Open all year.',
    },
    amenities: [
      'Showers and restrooms', // camper reviews on koa.com praise the private showers
      'Wi-Fi',
      'Cable TV',
      'Pool (late April to October 1)',
      'Café and camp store', // camper reviews on koa.com
      'Propane',
      'Firewood for sale',
      'Dog park',
      'Playground',
      'Pavilion',
      'Game room',
      'Disc golf',
      'Gem mining',
      'Hiking trailheads',
      'Bear boxes at tent sites',
      'Cabins',
    ],
    rules: [
      'RV and tent sites: check in 1 pm, check out 11 am',
      'Cabins: check in 3 pm, check out 11 am',
      'Up to 8 people per tent site',
      "Read KOA's pet policy before you bring pets",
    ],
    directions:
      '4874 Hooper Highway, Cosby, TN 37722, about 17 miles from downtown Gatlinburg. In October 2026 KOA routed campers around a closed section of I-40: take I-40 to exit 435 at Newport, then US 321 toward Gatlinburg. The office is open 24 hours.',
    phone: '(423) 532-7183',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Gatlinburg East / Smoky Mountain KOA Holiday', url: 'https://koa.com/campgrounds/gatlinburg/' },
    ],
  },

  // ── Sam Houston National Forest, Texas ─────────────────────────────────

  {
    id: 'hunter-camp-217a-sam-houston',
    name: 'Hunter Camp 217A, Sam Houston National Forest',
    latitude: 30.48719, // Campendium
    longitude: -95.12575,
    siteType: 'dispersed',
    landManager: 'Sam Houston National Forest · Sam Houston Ranger District',
    stayLimitDays: 14, // 14 days in any 30-day period (order 08-13-00-25-001)
    access: {
      // "The road was fine for a 2WD vehicle despite some potholes" (Oct 2021);
      // "rough but not impossible to traverse" (Jul 2025)
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Hard-packed dirt and red sand with potholes and ruts. Muddy after heavy rain',
      impassableWhenWet: null, // drivable in rain (Feb 2025), muddy after heavy rain
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // van camper, Mar 2023
      maxTrailerFt: 18, // 18 ft trailer towed in over ruts and bumps (Nov 2020)
      bigRig: null, // a 31 ft Class C fit with plenty of space (Feb 2021); nothing longer reported
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free. No water, toilets or trash service (a portable toilet near the entrance was reported in 2020).',
    },
    amenities: ['Horse and hiking trails nearby', 'Double Lake Recreation Area about 3 miles north'],
    rules: [
      'Stay up to 14 days in any 30 days',
      'Up to 8 people and 2 tents per campsite',
      'No gasoline generators from 10 pm to 6 am',
      'This is a designated hunter camp: expect hunters during fall and winter hunting seasons',
      'Check for burn bans before you light a fire',
      'Pack out all trash',
    ],
    directions:
      'On FS 217A off FM 2666, which connects to FM 2025 north of Cleveland or to US 59 east of Shepherd. About 3 miles south of Double Lake Recreation Area, between Cleveland and Coldspring. Many pull-off sites spread through the trees. Expect some highway noise and horseback riders on the roads.',
    phone: '(936) 344-6205', // Sam Houston Ranger District, New Waverly (Campendium)
    // Not in the data model yet: AT&T and T-Mobile good, Verizon some (2025–2026 reports).
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Hunter Camp 217A Dispersed Camping',
        url: 'https://maps.campendium.com/us/cleveland-tx/nature/hunter-camp-217a-dispersed-camping',
      },
      {
        label: 'The Dyrt: Hunter Camp on Forest Road 217A',
        url: 'https://www.thedyrt.com/camping/texas/hunter-camp-on-forest-road-217a',
      },
      {
        label: 'Forest Service: Texas national forests occupancy and use order',
        url: 'https://www.fs.usda.gov/r08/texas/alerts/national-forests-and-grasslands-texas-occupancy-and-use',
      },
    ],
  },

  // ── Shenandoah Mountain, Virginia ──────────────────────────────────────

  {
    id: 'flagpole-knob-george-washington',
    name: 'Flagpole Knob (Forest Road 85)',
    latitude: 38.5101, // The Dyrt; Virginia DWR gives 38.510096, -79.183964
    longitude: -79.18396,
    siteType: 'dispersed',
    landManager: 'George Washington National Forest · North River Ranger District',
    stayLimitDays: 14, // 14 days in any 30-day period
    access: {
      // Virginia DWR: "Remote, narrow, very steep, deeply rutted, and rocky. Only
      // experienced overlanding/off-roading drivers should attempt this road."
      // A stock Subaru Outback made it (Aug 2022), but most reports call for
      // high clearance and 4WD, so this is rated for the cautious case.
      clearanceTier: 4,
      drivetrain: '4wd-required',
      surface: 'Narrow, steep, rocky dirt road with deep ruts for about 3.6 miles from Briery Branch Gap',
      impassableWhenWet: null, // "may be impassable in winter"
    },
    fit: {
      tent: true,
      rtt: true,
      van: null, // a ProMaster camper van made it, but the driver warned others not to try (Jun 2024)
      maxTrailerFt: 0, // ASSUMPTION: steep, rutted 4x4 road; no camper reports of trailers
      bigRig: false,
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free dispersed camping. No water, toilets or trash service.',
    },
    amenities: ['Grassy summit with views', 'About 5 sites from the woods up to the summit (2020 estimate)'],
    rules: [
      'Stay up to 14 days in any 30 days',
      'Camp within 150 feet of the road and at least 100 feet from streams',
      'Use existing fire rings and burn only dead wood on the ground. Check fire restrictions first',
      'Pack it in, pack it out',
      'Raccoons are bold here: lock up food, trash and shoes',
    ],
    directions:
      'From Bridgewater, take VA 257 west through Briery Branch and stay on Briery Branch Road (SR 924) past Briery Branch Dam to Briery Branch Gap, where the road ends at a dirt pull-off by FR 85 and FR 25 (about 6.7 miles past the town of Briery Branch). Go north on FR 85 about 3.1 to 3.6 miles to the grassy summit area. If the road is too much for your rig, park at the gap and hike or bike in (7.2 miles round trip).',
    phone: '(540) 432-0187', // North River Ranger District (Virginia DWR)
    // Not in the data model yet: elevation about 4,385 ft. AT&T and Verizon
    // some LTE, T-Mobile none (camper reports through Oct 2026).
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'The Dyrt: Flagpole Knob', url: 'https://www.thedyrt.com/camping/virginia/flagpole-knob' },
      {
        label: 'Virginia DWR Birding & Wildlife Trail: Flagpole Knob',
        url: 'https://dwr.virginia.gov/vbwt/sites/flagpole-knob',
      },
      { label: 'Trails Offroad: Flagpole Knob', url: 'https://trailsoffroad.com/trails/2349-flagpole-knob' },
      {
        label: 'Forest Service: George Washington and Jefferson camping',
        url: 'https://www.fs.usda.gov/r08/gwj/recreation/camping-cabins',
      },
      {
        label: 'Forest Service: GWJ general prohibitions (14-day limit)',
        url: 'https://www.fs.usda.gov/r08/gwj/alerts/general-prohibitions',
      },
    ],
  },

  // ── Spruce Knob area, West Virginia ────────────────────────────────────

  {
    id: 'gandy-creek-dispersed-monongahela',
    name: 'Gandy Creek Dispersed Camping Area',
    latitude: 38.76111, // Campendium
    longitude: -79.5834,
    siteType: 'dispersed',
    landManager: 'Monongahela National Forest · Cheat-Potomac Ranger District',
    stayLimitDays: 14, // 14 days within a 28-day period at one site (order 09-21-12-01)
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Gravel county road, very dusty when dry. Traffic moves fast around curves',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true, // 20–21 ft Class B vans (2020, 2022)
      maxTrailerFt: 36, // 36 ft fifth wheel (May 2020)
      bigRig: true, // 36 ft fifth wheel (May 2020)
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0, // free per WVU DIY Outdoors; one Campendium report lists $3 (May 2023)
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free, first come, first served (one camper reported a $3 fee in 2023, so check signs). About 17 signed sites. No water or trash service. The vault toilet was closed after a tree damaged it (Aug 2026).',
    },
    amenities: ['Fire rings', 'Creekside sites with trout fishing', 'Seneca Creek Backcountry trailheads'],
    rules: [
      'Camp only at sites marked with a campsite sign',
      'No more than 2 vehicles per site',
      'Stay up to 14 days within 28 days at one site',
      "Don't leave gear unattended more than 24 hours",
      'No hitching saddle or pack animals between Gandy Creek Road, Route 29 and Gandy Creek',
      'Pack out all trash',
    ],
    directions:
      'Along Gandy Creek on Route 29 (Whitmer Road) on the west side of the Seneca Creek Backcountry, between Little Italy and the Forest Road 1 junction, north of Spruce Knob. From the Elkins area, take US 33 to Rich Mountain Road and go 1.7 miles to Job, then follow Route 29 about 15 miles (WVU DIY Outdoors directions). Cell service is weak to none, so download directions first.',
    phone: '(304) 636-1800', // Monongahela NF Supervisor's Office, Elkins
    // Not in the data model yet: elevation about 3,100 ft. Some cell service at
    // the north end (2022); none at other sites. Thefts reported in 2021.
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Gandy Creek Dispersed Camping Area',
        url: 'https://maps.campendium.com/us/whitmer-wv/camping-rv/gandy-creek-dispersed-camping-area',
      },
      {
        label: 'Forest Service: Gandy Creek Dispersed Area order',
        url: 'https://www.fs.usda.gov/r09/monongahela/alerts/gandy-creek-dispersed-area',
      },
      {
        label: 'Forest Service: Monongahela general use restrictions',
        url: 'https://www.fs.usda.gov/r09/monongahela/alerts/general-use-restrictions',
      },
      { label: 'Forest Service: Monongahela alerts', url: 'https://www.fs.usda.gov/r09/monongahela/alerts' },
      {
        label: 'WVU DIY Outdoors: Gandy Creek Dispersed Camping',
        url: 'https://diyoutdoors.wvu.edu/camping/gandy-creek-dispersed-camping',
      },
    ],
  },
];
