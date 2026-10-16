import type { Spot } from '../../types';

// Southwest starter spots: Arizona, the California deserts, Nevada, New Mexico
// and Utah. Researched October 2026. Rules change often out here (designated
// sites, permits, fire bans), so every spot links the pages it came from.

export const SOUTHWEST_SPOTS: Spot[] = [
  // ── Sedona, Arizona ─────────────────────────────────────────────────────

  {
    id: 'forest-road-525-surprise-sedona',
    name: 'Forest Road 525 near Sedona (Surprise designated area)',
    latitude: 34.82348, // Campendium
    longitude: -111.90609,
    siteType: 'dispersed',
    landManager: 'Coconino National Forest · Red Rock Ranger District',
    stayLimitDays: 14, // 14 days in any 30-day period on the Coconino NF
    // Not in the data model yet: elevation about 3,940 ft.
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'Gravel road with light washboard and some ruts after heavy rain. Surprise is the first area on FR 525; the road gets rougher farther in.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 36, // Campendium longest reported; 33 and 34 ft trailers in reviews
      bigRig: true, // "Could easily get large rigs in" (Oct 2025); large 5th wheels seen (Nov 2022)
      turnaround: true, // Reviewers describe large, open dirt pull-in areas
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. Since Sept. 2022, camping in west Sedona is allowed only inside 8 signed designated areas, and Surprise is one of them. It is an open, busy lot, not a secluded site. No water or trash service.',
    },
    amenities: ['Portable toilets (reported by campers in 2025)'],
    rules: [
      'Camp only inside the signed designated areas. All other dispersed camping in west Sedona is closed.',
      'No wood or charcoal fires. Propane stoves and propane fire rings only.',
      'Stay up to 14 days in any 30-day period',
      'No camping within 1/4 mile of a wildlife water tank (Arizona law)',
      'Pack out all trash',
    ],
    directions:
      'Between Sedona and Cottonwood, turn north off AZ-89A onto FR 525 (Loy Butte Road). Stop at the information portal on FR 525 for the map of designated areas. Surprise is the first designated area you reach. Busy on weekends.',
    phone: '(928) 203-2900', // Red Rock Ranger Visitor Center
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Surprise Designated Dispersed Camping',
        url: 'https://maps.campendium.com/us/sedona-az/camping-rv/surprise-designated-dispersed-camping',
      },
      {
        label: 'Forest Service: Red Rock Ranger District camping guide (PDF)',
        url: 'https://fs.usda.gov/Internet/FSE_DOCUMENTS/fseprd1116620.pdf',
      },
      {
        label: 'Forest Service: Red Rock Ranger Visitor Center',
        url: 'https://fs.usda.gov/r03/coconino/offices/red-rock-ranger-visitor-center',
      },
      {
        label: 'Campendium: old FR 525 dispersed listing (closed in 2022)',
        url: 'https://maps.campendium.com/us/sedona-az/nature/loy-butte-rd-dispersed-camping-fr-525',
      },
    ],
  },

  // ── Grand Canyon South Rim, Arizona ─────────────────────────────────────

  {
    id: 'forest-road-302-tusayan',
    name: 'Forest Road 302 near Tusayan (Grand Canyon South Rim)',
    latitude: 35.9681, // Campendium
    longitude: -112.1185,
    siteType: 'dispersed',
    landManager: 'Kaibab National Forest · Tusayan Ranger District',
    stayLimitDays: 14, // 14 days in any 30-day period (Kaibab Forest Order 03-07-20-03-R)
    // Not in the data model yet: elevation about 6,660 ft.
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'Firm-packed dirt and gravel, mostly smooth with light washboard. Narrow in places. Pull-ins can get muddy during snowmelt.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 32, // "rigs over 32 ft would struggle to find a site" (Mar 2022); others fit 38–43 ft
      bigRig: null, // Mixed reports: a 58 ft truck + 5th wheel found a site, others struggled
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No water, toilets or trash service. Tour helicopters fly over from about 9 am. Tusayan has gas, food and restrooms a few minutes away.',
    },
    amenities: [],
    rules: [
      'Stay up to 14 days in any 30-day period',
      'Camp in already-used sites within 30 feet of the road',
      'The first 1/4 mile of FR 302 has historically been closed to camping',
      'No camping within 1 mile of Ten-X Campground (Forest Order 03-07-01-23-02, through Aug. 2033)',
      'Check Kaibab fire restrictions before having a campfire',
      'Pack out all trash',
    ],
    directions:
      'In Tusayan, turn east off AZ-64 onto FR 302. Drive past the first quarter mile; campers report good sites about 2 miles in. The Grand Canyon South Entrance is a few minutes north on AZ-64. Scout ahead before pulling a long trailer into a site.',
    phone: '(928) 638-2443', // Tusayan Ranger District
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Forest Road 302 Dispersed Camping',
        url: 'https://www.campendium.com/forest-road-302/page/2',
      },
      {
        label: 'The Dyrt: Tusayan Dispersed Camping FS Road 302',
        url: 'https://www.thedyrt.com/camping/arizona/tusayan-dispersed-camping-fs-road-302',
      },
      {
        label: "Boondocker's Bible: Forest Road 302",
        url: 'https://www.boondockersbible.com/campsite/forest-road-302-grand-canyon-np/',
      },
      {
        label: "Boondocker's Bible: Kaibab National Forest camping rules",
        url: 'https://www.boondockersbible.com/learn/kaibab-national-forest-camping-rules/',
      },
      {
        label: 'Forest Service: camping closure near developed sites (Kaibab)',
        url: 'https://www.fs.usda.gov/r03/kaibab/alerts/campingcampfire-closure-within-proximity-developed-sites',
      },
      {
        label: 'Forest Service: Tusayan Ranger District',
        url: 'https://www.fs.usda.gov/r03/kaibab/offices/tusayan-ranger-district',
      },
    ],
  },

  {
    id: 'grand-canyon-south-rim-koa-holiday',
    name: 'Grand Canyon South Rim KOA Holiday',
    latitude: 35.32745, // koa.com
    longitude: -112.15661,
    siteType: 'campground',
    landManager: 'KOA (private) · Grand Canyon South Rim KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1,
      drivetrain: '2wd-ok',
      surface: 'Paved highway (AZ-64) to the campground',
      impassableWhenWet: false,
    },
    fit: {
      tent: true, // Tent and premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 90, // koa.com: 90 ft max length
      bigRig: true, // 90 ft max length, 50 amp, pull-thru sites
      turnaround: true, // Pull-thru sites ("All sites are pull-thru", Campendium 2022)
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: null,
      hookups: ['electric', 'water', 'sewer'],
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. No current price seen. Open March 1 to October 31. About an hour from the South Rim.',
    },
    amenities: [
      'Wi-Fi',
      'Pool (mid-May to Oct. 1)',
      'Hot tub',
      'Dog park',
      'Coffee bar',
      'Propane',
      'Firewood',
      'Bike rentals',
      'Cabins',
    ],
    rules: [
      'RV and tent sites: check-in 3:00 pm, check-out 11:00 am',
      'Office open 8 am to 6 pm',
      'Pet-friendly RV sites; see the KOA pet policy',
      'Open March 1 to October 31',
    ],
    directions:
      'From I-40 at Williams, take exit 165 and go north on AZ-64 about 5 miles. The KOA is on the left. From Grand Canyon, it is about 40 miles south on AZ-64.',
    phone: '(928) 635-2307',
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'KOA: Grand Canyon South Rim KOA Holiday',
        url: 'https://koa.com/campgrounds/grand-canyon/',
      },
      {
        label: 'Campendium: Grand Canyon South Rim KOA Holiday',
        url: 'https://maps.campendium.com/us/williams-az/camping-rv/grand-canyon-williams-koa-journey-williams-az--0',
      },
    ],
  },

  // ── Alabama Hills (Owens Valley), California ────────────────────────────

  {
    id: 'alabama-hills-movie-road',
    name: 'Alabama Hills designated sites on Movie Road',
    latitude: 36.62084, // Campendium. APPROXIMATE: center of the Movie Road camping area, not one site
    longitude: -118.11244,
    siteType: 'dispersed',
    landManager: 'BLM · Bishop Field Office (Alabama Hills National Scenic Area)',
    stayLimitDays: 14, // 14 days per calendar year in the Bishop BLM Field Office area (Sierra Forever)
    // Not in the data model yet: elevation about 4,700 ft.
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface: 'Movie Road is graded dirt kept up by the BLM. Spur roads to some sites are rough, narrow and uneven.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 30, // A 30 ft 5th wheel found "2 maybe 4 spots" (Nov 2023)
      bigRig: false, // "very few which will accommodate larger rigs"; RV and trailer spots "extremely limited"
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free, but you need a free Alabama Hills camping permit (online, at the Eastern Sierra Visitor Center in Lone Pine, or at the Movie Road kiosks). The permit does not hold a site. About 50 signed sites, first come, first served. No water. Weekends fill up; nearby Tuttle Creek and Lone Pine campgrounds are backups.',
    },
    amenities: ['Porta-potties at Mobius Arch trailhead and across from Shark Fin parking'],
    rules: [
      'Camp only in sites marked with a tent symbol. Everywhere else is day use only.',
      'Free Alabama Hills camping permit required (good for one year)',
      'Pack out solid human waste and toilet paper (wag bag or portable toilet) unless you use the porta-potties',
      'Fires only in existing rings at designated sites, with a free California campfire permit. Check fire restrictions.',
      'Stay up to 14 days per calendar year in the Bishop BLM Field Office area',
      "Keep tents, vehicles and kitchens on bare ground. Don't crush the brush.",
    ],
    directions:
      'From US-395 in Lone Pine, turn west at the stoplight onto Whitney Portal Road. Drive 2.5 miles and turn right onto Movie Road. Look for signed sites with a tent symbol and check the map at the kiosk. The west side of Movie Road in the Movie Flat area is day use only. The map pin is approximate.',
    phone: '(760) 872-5000', // BLM Bishop Field Office
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'BLM: Alabama Hills', url: 'https://www.blm.gov/alabamahills' },
      {
        label: 'BLM: Alabama Hills National Scenic Area',
        url: 'https://www.blm.gov/programs/national-conservation-lands/california/alabama-hills-national-scenic-area',
      },
      { label: 'Sierra Forever: Camping in the Alabama Hills', url: 'https://sierraforever.org/?p=11439' },
      {
        label: 'Campendium: Movie Road Designated Dispersed Camping',
        url: 'https://maps.campendium.com/us/lone-pine-ca/camping-rv/movie-road-designated-dispersed-camping',
      },
      {
        label: 'The Dyrt: Alabama Hills on Movie Flat Road',
        url: 'https://www.thedyrt.com/camping/california/alabama-hills-on-movie-flat-road',
      },
    ],
  },

  // ── Joshua Tree, California ─────────────────────────────────────────────

  {
    id: 'joshua-tree-south-blm',
    name: 'Joshua Tree South BLM (Cottonwood Springs Road)',
    latitude: 33.67449, // Campendium
    longitude: -115.8019,
    siteType: 'dispersed',
    landManager: 'BLM · Palm Springs-South Coast Field Office',
    stayLimitDays: 14, // BLM: 14 days in any 28-day period
    // Not in the data model yet: elevation about 1,770 ft. Very hot in summer.
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'Short dirt roads off paved Cottonwood Springs Road. Some washboard and a few soft, sandy spots. Flash floods happen here about once a year.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 43, // "plenty of room for our 43 ft fifth wheel" (Dec 2024)
      bigRig: true, // "super accessible for rigs of all sizes" (Mar 2026)
      turnaround: true, // Reviewers report pull-through sites
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free dispersed camping. No water, toilets or trash service. Campers report a water fill and dump station near the Cottonwood visitor center inside Joshua Tree National Park.',
    },
    amenities: [],
    rules: [
      'Stay up to 14 days in any 28-day period',
      'Campfires on BLM land in California need a free California campfire permit. Check fire restrictions.',
      'Watch for private parcels and No Trespassing signs along the dirt roads',
      'Pack out all trash',
    ],
    directions:
      "From I-10, take the Cottonwood Springs Road exit for Joshua Tree National Park's south entrance and head north. Dirt roads branch off to the left and right just south of the park entrance; sites are along them. Easy to miss in the dark.",
    phone: '(760) 833-7100', // BLM Palm Springs-South Coast Field Office
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Joshua Tree South Dispersed Camping',
        url: 'https://maps.campendium.com/us/ca/camping-rv/joshua-tree-south-dispersed-camping',
      },
      {
        label: 'Campendium: Joshua Tree South reviews',
        url: 'https://www.campendium.com/joshua-tree-south/page/1',
      },
      {
        label: "Boondocker's Bible: Joshua Tree BLM South",
        url: 'https://www.boondockersbible.com/camping/joshua-tree-blm-south-chiriaco-summit-ca/',
      },
      { label: 'BLM: Camping on public lands', url: 'https://blm.gov/programs/recreation/camping?page=1' },
      {
        label: 'BLM: California campfire permit rule (Alabama Hills page)',
        url: 'https://www.blm.gov/alabamahills',
      },
    ],
  },

  // ── Mojave National Preserve, California ────────────────────────────────

  {
    id: 'kelso-dunes-mine-mojave',
    name: 'Kelso Dunes Mine roadside camping, Mojave National Preserve',
    latitude: 34.88824, // National Park Service
    longitude: -115.71663,
    siteType: 'dispersed',
    landManager: 'National Park Service · Mojave National Preserve',
    stayLimitDays: 14,
    // Not in the data model yet: elevation about 2,500 ft. Little or no cell service.
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface:
        'About 4 miles of unpaved, washboard road. Soft sand off the packed track, so stay on it. The park does no maintenance on dirt roads.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 30, // 20–30 ft travel trailers in Campendium reviews
      bigRig: true, // NPS: the only undeveloped site that can host larger RV groups; 37 ft Class A reported
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free roadside camping at NPS-designated sites. No water or trash service. Campers report vault toilets at the camping area and the dunes trailhead.',
    },
    amenities: ['Kelso Dunes hiking trail', 'Vault toilets (reported by campers)'],
    rules: [
      'Camp only at the sites past the Kelso Dunes trailhead. Camping is banned elsewhere on Kelso Dunes Road and at the trailhead.',
      'Stay up to 14 days',
      'Fires only in an existing fire ring or a fire pan. Bring your own wood; gathering wood is banned.',
      'Pack out trash and toilet paper. Bury human waste at least 6 inches deep.',
      'Groups of more than 7 vehicles or 25 people need a permit',
    ],
    directions:
      'From I-40, take Kelbaker Road north toward Kelso. Turn west onto unpaved Kelso Dunes Road and drive about 4 miles. One site is south of the road 1/4 mile past the marked trailhead; more are about 3/4 mile past it. About 18.5 miles from I-40.',
    phone: '(760) 252-6100', // Mojave National Preserve
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'NPS: Mojave camping', url: 'https://www.nps.gov/moja/planyourvisit/camping.htm' },
      {
        label: 'NPS: Mojave undeveloped campsites',
        url: 'https://www.nps.gov/moja/planyourvisit/undeveloped-campsites.htm',
      },
      { label: 'NPS: Mojave RV camping', url: 'https://www.nps.gov/moja/planyourvisit/rv-camping.htm' },
      {
        label: 'Campendium: Kelso Dunes Mine',
        url: 'https://maps.campendium.com/us/amboy-ca/nature/kelso-dunes-mine',
      },
    ],
  },

  {
    id: 'sunrise-rock-mojave',
    name: 'Sunrise Rock roadside camping, Mojave National Preserve',
    latitude: 35.31704, // National Park Service (the high-clearance/4WD site)
    longitude: -115.54723,
    siteType: 'dispersed',
    landManager: 'National Park Service · Mojave National Preserve',
    stayLimitDays: 14,
    access: {
      clearanceTier: 4,
      drivetrain: '4wd-required', // NPS says "High Clearance/4WD recommended"; marked required to be safe
      surface: 'Short rocky dirt spur with soft sand off paved Cima Road',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
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
      notes: 'Free roadside camping at an NPS-designated site. No water, toilets or trash service.',
    },
    amenities: ['Teutonia Peak trailhead across Cima Road'],
    rules: [
      'Camp only in already-used sites. Making new campsites is not allowed.',
      'Stay up to 14 days',
      'Fires only in an existing fire ring or a fire pan. Bring your own wood; gathering wood is banned.',
      'Pack out trash and toilet paper. Bury human waste at least 6 inches deep.',
      'Pitch tents out of sight of paved roads',
    ],
    directions:
      'On the east side of Cima Road, about 12 miles south of I-15, across from the Teutonia Peak trailhead. NPS lists a second site nearby that most 2WD vehicles can reach (35.31681, -115.54494). This pin is the site that needs high clearance and 4WD.',
    phone: '(760) 252-6100', // Mojave National Preserve
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'NPS: Mojave undeveloped campsites',
        url: 'https://www.nps.gov/moja/planyourvisit/undeveloped-campsites.htm',
      },
      { label: 'NPS: Mojave camping', url: 'https://www.nps.gov/moja/planyourvisit/camping.htm' },
    ],
  },

  // ── Barstow (I-15 / I-40), California ───────────────────────────────────

  {
    id: 'barstow-calico-koa-holiday',
    name: 'Barstow / Calico KOA Holiday',
    latitude: 34.90281, // koa.com
    longitude: -116.89204,
    siteType: 'campground',
    landManager: 'KOA (private) · Barstow / Calico KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1,
      drivetrain: '2wd-ok',
      surface: 'Paved frontage road off I-15',
      impassableWhenWet: false,
    },
    fit: {
      tent: true, // Standard and premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 70, // koa.com: "Max pull thru 70 feet" (amenities list says 72 ft)
      bigRig: true, // 70 ft pull-thrus, 50 amp
      turnaround: true, // Pull-thru sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: 70, // Campendium review, site 38, Jan 2026
      hookups: ['electric', 'water', 'sewer'],
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. Lowest price seen January 2026 ($70 RV site, reported by a camper on Campendium). Open all year.',
    },
    amenities: [
      'Showers',
      'Laundry',
      'Pool (seasonal)',
      'Snack bar',
      'Wi-Fi',
      'Cable TV',
      'Propane',
      'Firewood',
      'Bike rentals',
      'Dog park',
      'Cabins',
    ],
    rules: [
      'Check-in 2:00 pm, check-out 11:00 am',
      'Open all year',
      'Pets allowed with owner supervision; see the KOA pet policy',
    ],
    directions:
      "Don't use the street address in GPS. From I-15, take exit 191 (Ghost Town Road) to the service station, then turn left and go 1/4 mile. From I-40, take exit 7 (Daggett Road) north 3.5 miles, under I-15, then left at the service station and 1/4 mile. Calico Ghost Town is about 3 miles away.",
    phone: '(760) 904-3069',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Barstow / Calico KOA Holiday', url: 'https://koa.com/campgrounds/barstow/' },
      {
        label: 'Campendium: Barstow-Calico KOA',
        url: 'https://maps.campendium.com/us/yermo-ca/camping-rv/barstow-calico-koa',
      },
    ],
  },

  // ── Gold Butte, Nevada ──────────────────────────────────────────────────

  {
    id: 'whitney-pocket-gold-butte',
    name: 'Whitney Pocket, Gold Butte National Monument',
    latitude: 36.52369, // Campendium
    longitude: -114.13283,
    siteType: 'dispersed',
    landManager: 'BLM · Las Vegas Field Office (Gold Butte National Monument)',
    stayLimitDays: 14, // 14 days within any 28-day period (BLM Gold Butte page)
    // Not in the data model yet: elevation about 3,100 ft. Weak or no cell service.
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'About 21 miles of old, broken pavement with potholes and gravel patches. Go slow. Roads past Whitney Pocket need high clearance and 4WD.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 42, // Campendium longest reported (2016); Bird & Hike: several sites fit several trailers
      bigRig: true, // "several spots suitable for big rigs" (Campendium, Oct 2020)
      turnaround: null, // Some sites are hard to turn a large trailer in
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free primitive camping. No water or services for about 25 miles, so bring everything. A porta-potty is sometimes placed at the day-use area.',
    },
    amenities: ['Hiking among sandstone formations'],
    rules: [
      'Stay up to 14 days within any 28-day period',
      'Pack out all trash',
      'Protect the historic stone wall from the 1930s Civilian Conservation Corps',
      'Check BLM fire restrictions before having a campfire',
    ],
    directions:
      'From I-15, take exit 112 (about 70 miles east of Las Vegas). Go south 3.1 miles on NV-170 toward Riverside. Just after crossing the Virgin River, turn right onto Gold Butte Road. Whitney Pocket is about 21 miles in, where the pavement ends.',
    phone: '(702) 515-5000', // BLM Las Vegas Field Office
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'BLM: Gold Butte National Monument', url: 'https://www.blm.gov/visit/gold-butte-national-monument' },
      {
        label: 'Campendium: Whitney Pocket',
        url: 'https://maps.campendium.com/us/bunkerville-nv/points-of-interest/whitney-pocket',
      },
      {
        label: 'Bird & Hike: Whitney Pocket campsites',
        url: 'https://t.birdandhike.com/Hike/GoldButte/Campsites/WP-camps/_WP-camps.htm',
      },
      {
        label: 'Roadtrip Ryan: Whitney Pocket',
        url: 'https://www.roadtripryan.com/go/t/nevada/southern-nevada/whitney-pocket',
      },
    ],
  },

  // ── Carlsbad Caverns, New Mexico ────────────────────────────────────────

  {
    id: 'chosa-blm-carlsbad-caverns',
    name: 'Chosa Campground (BLM) near Carlsbad Caverns',
    latitude: 32.08861, // BLM
    longitude: -104.43222,
    // BLM calls it a campground, but it is a free, undeveloped gravel lot:
    // no marked sites, toilets or water.
    siteType: 'dispersed',
    landManager: 'BLM · Carlsbad Field Office',
    stayLimitDays: 14,
    access: {
      clearanceTier: 1,
      drivetrain: '2wd-ok',
      surface: 'Paved highway, then 1/4 mile of flat dirt county road to a large gravel lot',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: null, // No length given; reviewers say it fits "any size rig"
      bigRig: true, // BLM: "can comfortably fit several large RVs"
      turnaround: true, // 3.5-acre gravel pad
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free, first come, first served. A fenced 3.5-acre gravel lot with a dumpster and primitive fire rings. No toilets or water. Food, gas and water in Whites City, about 8 miles away. Can be windy at night.',
    },
    amenities: ['Trash dumpster', 'Primitive fire rings'],
    rules: [
      'Stay up to 14 days',
      'Fires only in the fire rings provided',
      'Pets on a 6-foot leash',
      'No fireworks or shooting',
      'Carry out all litter',
    ],
    directions:
      'From Carlsbad, drive south on US-62/180 about 27 miles to about mile marker 9. Turn east onto Dillahunty Road (County Road 424) and go 1/4 mile. The camp is on the north side. Carlsbad Caverns needs a timed-entry ticket (nps.gov/cave).',
    phone: '(575) 234-5972', // BLM Carlsbad Field Office
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'BLM: Chosa Campground', url: 'https://www.blm.gov/visit/chosa-campground' },
      { label: 'The Dyrt: Chosa Campground', url: 'https://thedyrt.com/camping/new-mexico/chosa-campground-nm' },
    ],
  },

  {
    id: 'carlsbad-koa-holiday',
    name: 'Carlsbad KOA Holiday',
    latitude: 32.58647, // koa.com
    longitude: -104.41623,
    siteType: 'campground',
    landManager: 'KOA (private) · Carlsbad KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1,
      drivetrain: '2wd-ok',
      surface: 'Paved highway (US-285) to the campground',
      impassableWhenWet: false,
    },
    fit: {
      tent: true, // Premium tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 75, // koa.com: max pull-thru 75 ft
      bigRig: true, // koa.com lists it as big rig friendly
      turnaround: true, // Most sites are pull-thrus
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: 66, // Campendium review, site B03, Jul 2026
      hookups: ['electric', 'water', 'sewer'],
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. Lowest price seen July 2026 ($66 RV site, reported by a camper on Campendium). Open all year.',
    },
    amenities: [
      'Pool (seasonal)',
      'Laundry',
      'Snack bar',
      'Wi-Fi',
      'Dog park',
      'Propane',
      'Firewood',
      'Community room',
      'Pavilion',
      'Cabins',
    ],
    rules: [
      'Check-in 2:00 pm, check-out 11:00 am',
      'Office open 10 am to 6 pm',
      'Open all year',
      'Carlsbad Caverns needs a timed-entry reservation (nps.gov/cave)',
    ],
    directions: 'About 13 miles north of Carlsbad on US-285, between mile markers 51 and 52.',
    phone: '(575) 457-2000',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Carlsbad KOA Holiday', url: 'https://koa.com/campgrounds/carlsbad/' },
      {
        label: 'KOA: Carlsbad RV sites',
        url: 'https://koa.com/campgrounds/carlsbad/site-type/rv-camping-sites/',
      },
      { label: 'Campendium: Carlsbad KOA', url: 'https://maps.campendium.com/us/carlsbad-nm/camping-rv/carlsbad-koa' },
    ],
  },

  // ── Gila National Forest (Silver City), New Mexico ──────────────────────

  {
    id: 'cattlemen-trail-gila',
    name: 'Cattlemen Trail dispersed area near Silver City',
    latitude: 32.54945, // Campendium
    longitude: -108.427,
    siteType: 'dispersed',
    landManager: 'Gila National Forest',
    // Gila Forest Order 03-06-00-23-004: 14 days in any 30-day period. The posted
    // order ran to May 2025; we assume the limit still applies. Campendium lists 15.
    stayLimitDays: 14,
    // Not in the data model yet: elevation about 6,360 ft.
    access: {
      clearanceTier: 2,
      drivetrain: '2wd-ok',
      surface:
        'Short gravel entry road off NM-90, improved by the Forest Service. Some site pull-ins have steep drop-offs. Side spurs like FS 585 are rocky.',
      impassableWhenWet: null,
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 40, // 40 ft toy hauler "without trouble" (Apr 2024); 41 ft 5th wheel found it tight (May 2023)
      bigRig: true, // "large gravel lot fits oversized rigs" (Feb 2024)
      turnaround: true, // "large parking lot for turning around" (Apr 2024)
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free dispersed camping. No water, toilets or trash service. Cattle graze the area.',
    },
    amenities: ['Continental Divide Trail nearby'],
    rules: [
      'Stay up to 14 days in any 30-day period on the Gila National Forest',
      'Part of the area is now closed to vehicles. Obey No Camping signs.',
      'A bear warning sign is posted. Keep a clean camp and store food securely.',
      'Check Gila fire restrictions before having a campfire',
      'Pack out trash and toilet paper',
    ],
    directions:
      'On NM-90 about 20 miles southwest of Silver City. Coming from the east, stay on NM-90; GPS may send you down rough, washboarded White Water Road. Big rigs should use the gravel lot near the entrance.',
    phone: '(575) 388-8201', // Gila National Forest, Silver City
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'Campendium: Cattlemen Trail Dispersed Camping',
        url: 'https://maps.campendium.com/us/silver-city-nm/nature/cattlemen-trail-dispersed-camping',
      },
      { label: 'The Dyrt: Cattlemen Trail', url: 'https://thedyrt.com/camping/new-mexico/cattlemen-trail' },
      {
        label: 'Forest Service: Gila 14-day stay limit order',
        url: 'https://www.fs.usda.gov/r03/gila/alerts/14-day-stay-limit-forest-order-03-06-00-23-004',
      },
      {
        label: 'NPS: Camping near Silver City (Gila NF phone)',
        url: 'https://www.nps.gov/gicl/planyourvisit/camping-near-silver-city.htm',
      },
    ],
  },

  // ── Moab, Utah ──────────────────────────────────────────────────────────

  {
    id: 'moab-koa-holiday',
    name: 'Moab KOA Holiday',
    latitude: 38.5225, // koa.com
    longitude: -109.49729,
    siteType: 'campground',
    landManager: 'KOA (private) · Moab KOA Holiday',
    stayLimitDays: null,
    access: {
      clearanceTier: 1,
      drivetrain: '2wd-ok',
      surface: 'Paved highway (US-191) to the campground',
      impassableWhenWet: false,
    },
    fit: {
      tent: true, // Premium tent sites; tents only on tent sites
      rtt: true, // ASSUMPTION: any site fits a rooftop tent
      van: true, // ASSUMPTION: any site fits a van
      maxTrailerFt: 80, // koa.com: "Max pull thru is 80 feet"
      bigRig: true, // 80 ft pull-thrus, 50 amp
      turnaround: true, // Pull-thru sites
    },
    cost: {
      nightlyFeeUsd: null,
      rvFeeUsd: 130, // Campendium reviews, Jun and Sep 2025
      hookups: ['electric', 'water', 'sewer'],
      reservations: 'reservable',
      notes:
        'Prices vary by date and site; check koa.com. Lowest price seen June 2025 ($130 RV site, reported by campers on Campendium). Open March 5 to November 30. Campers say RV sites are tight.',
    },
    amenities: [
      'Showers',
      'Laundry (24 hours)',
      'Pool (mid-March to Oct. 31)',
      'Hot tub',
      'Camp store',
      'Wi-Fi',
      'Dog park',
      'Propane',
      'Firewood',
      'Playground',
      'Bike wash and repair station',
      'Cabins',
    ],
    rules: [
      'RV and tent sites: check-in 1:00 pm, check-out 11:00 am',
      'Quiet hours 10 pm to 8 am',
      'Tents only on tent sites',
      'Pets welcome; cabin stays have a pet fee',
      '5 mph speed limit',
      'Open March 5 to November 30',
    ],
    directions: 'On US-191 at mile marker 121, about 4 miles south of the Moab Visitor Center.',
    phone: '(435) 241-7890',
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'KOA: Moab KOA Holiday', url: 'https://koa.com/campgrounds/moab/' },
      {
        label: 'KOA: Moab KOA Holiday general info',
        url: 'https://koa.com/campgrounds/moab/general-information/',
      },
      { label: 'Campendium: Moab KOA', url: 'https://maps.campendium.com/us/moab-ut/camping-rv/moab-koa' },
    ],
  },

  // ── Valley of the Gods (Bears Ears), Utah ───────────────────────────────

  {
    id: 'valley-of-the-gods',
    name: 'Valley of the Gods near Bluff',
    latitude: 37.2362, // The Dyrt (east end, off US-163)
    longitude: -109.81518,
    siteType: 'dispersed',
    landManager: 'BLM · Monticello Field Office (Bears Ears National Monument)',
    stayLimitDays: 14, // BLM general limit: 14 days in any 28-day period (no area-specific limit found)
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface:
        'Graded gravel and clay loop (County Road 242) with sharp turns, rocky bits and several wash crossings. Fine for cars when dry. Spur roads to sites off the loop need high clearance.',
      impassableWhenWet: true, // BLM: "can be difficult or even impassable when wet"
    },
    fit: {
      tent: true,
      rtt: true,
      van: true,
      maxTrailerFt: 25, // 25 ft trailer behind an F150 (Mar 2024); 20 ft (Mar 2026)
      bigRig: null,
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes: 'Free. No water, toilets or trash service. Bring plenty of water. Cell service is spotty.',
    },
    amenities: [],
    rules: [
      'No campfires anywhere in Valley of the Gods',
      'Camp only in already-used sites, away from ponds, corrals and archaeological sites',
      'Pack out all trash and toilet paper',
      'Keep pets out of archaeological sites',
      'Stay up to 14 days in any 28-day period (BLM general limit)',
    ],
    directions:
      'From US-163, about 15 miles west of Bluff and 7 miles east of Mexican Hat, turn north onto Valley of the Gods Road (County Road 242). Sites start near this east entrance. Towing the full 17-mile loop is not advised. The Moki Dugway on UT-261 is an 11% grade; take care with RVs and trailers.',
    phone: '(435) 587-1500', // BLM Monticello Field Office
    verified: false,
    reportCount: 0,
    sources: [
      { label: 'BLM: Valley of the Gods', url: 'https://www.blm.gov/visit/search-details/269135/1' },
      {
        label: 'BLM: Valley of the Gods brochure (PDF)',
        url: 'https://www.blm.gov/sites/blm.gov/files/documents/files/Utah_BENM_Valley-Of_Gods_Brochure.pdf',
      },
      {
        label: 'The Dyrt: Valley of the Gods Road Dispersed',
        url: 'https://www.thedyrt.com/camping/utah/valley-of-the-gods-ut-2',
      },
      { label: 'Visit Bluff: Valley of the Gods', url: 'https://bluffutah.org/valley-of-the-gods/' },
      { label: 'BLM: Camping on public lands', url: 'https://blm.gov/programs/recreation/camping?page=1' },
    ],
  },

  // ── Hurricane Cliffs (near Zion), Utah ──────────────────────────────────

  {
    id: 'hurricane-cliffs-sheep-bridge',
    name: 'Hurricane Cliffs designated sites 1-12 (Sheep Bridge Road)',
    latitude: 37.1632, // Campendium
    longitude: -113.25235,
    siteType: 'dispersed',
    landManager: 'BLM · St. George Field Office',
    stayLimitDays: 14, // 14 days in any 28-day period
    // Not in the data model yet: elevation about 3,870 ft.
    access: {
      clearanceTier: 3,
      drivetrain: '2wd-ok',
      surface: 'Unimproved dirt with washboard. Decent clearance helps. Wet silt and clay gets very slick.',
      impassableWhenWet: true, // BLM: "Local roads may become impassable during wet weather"
    },
    fit: {
      tent: true, // BLM: all sites suit tents
      rtt: true,
      van: true,
      maxTrailerFt: 35, // Campendium longest reported; one reviewer had a 44 ft 5th wheel
      bigRig: null, // BLM: not all sites are reachable by RVs or trailers
      turnaround: null,
    },
    cost: {
      nightlyFeeUsd: 0,
      rvFeeUsd: null,
      hookups: [],
      reservations: 'not-needed',
      notes:
        'Free. 56 numbered sites across the Hurricane Cliffs area, first come, first served; this pin is the group of sites 1-12. Most are taken by mid-afternoon on Fridays. Restrooms at the Sheep Bridge, JEM and Virgin Dam trailheads.',
    },
    amenities: ['Metal fire ring at each site', 'Restrooms at nearby trailheads'],
    rules: [
      'Camp only at the numbered designated sites',
      'Stay up to 14 days in any 28-day period',
      'Fires only in the steel fire rings. Follow current fire restrictions.',
      'Use the trailhead restrooms or bring a portable toilet',
      'Turn around if your tires are leaving ruts in wet weather',
      'Respect private property',
    ],
    directions:
      'East of Hurricane on UT-59. Coming from Hurricane, Sheep Bridge Road is on the left just after you crest the hill, so get in the passing lane. Sites 2-12 are along Sheep Bridge Road; look for the numbered posts.',
    phone: '(435) 688-3200', // BLM St. George Field Office
    verified: false,
    reportCount: 0,
    sources: [
      {
        label: 'BLM: Hurricane Cliffs Designated Dispersed Camping Area',
        url: 'https://www.blm.gov/visit/hurricane-cliffs-designated-dispersed-camping-area',
      },
      {
        label: 'Campendium: Hurricane Cliffs Designated Dispersed Campsites 1-12',
        url: 'https://maps.campendium.com/us/hurricane-ut/nature/hurricane-cliffs-designated-dispersed-campsites-1-12',
      },
      {
        label: 'St. George News: new camping plan between Hurricane and Zion (Apr 2026)',
        url: 'https://www.stgeorgeutah.com/life/visitors-may-soon-find-new-places-to-camp-between-hurricane-and-zion-national-park/article_a3a6268b-5116-473f-92bc-03b481db5a41.html',
      },
    ],
  },
];
