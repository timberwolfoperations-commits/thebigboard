// Power-conference membership for men's college basketball, by ESPN
// team id — the stable id ESPN uses across its scoreboard, core API,
// and team pages (Duke = 150, UNC = 153, Kansas = 2305).
//
// Generated 2026-11-13 from ESPN's own conference group resources
// (sports.core.api.espn.com …/seasons/2027/types/2/groups/{2,7,8,23,4}
// /teams), then verified team-by-team against the team resources —
// all 79 resolve to the right schools. Realignment is an offseason
// event: re-run the fetch and update this map if a school moves.
//
// Which conferences count as "power" is the product call (the CBB
// top-games slate is ranked games plus games where BOTH teams are
// in one of these five); the ids below are just the membership.

export const POWER_CONFERENCES = ["ACC", "Big Ten", "Big 12", "SEC", "Big East"] as const;

export type PowerConference = (typeof POWER_CONFERENCES)[number];

// ESPN team id -> conference. Keyed by id, not abbreviation:
// abbreviations collide (OSU, MSU, ASU) and a couple change
// with the school; ids don't.
export const POWER_CONFERENCE_BY_TEAM_ID: Record<string, PowerConference> = {
  // ACC
  "24": "ACC", // STAN — Stanford Cardinal
  "25": "ACC", // CAL — California Golden Bears
  "52": "ACC", // FSU — Florida State Seminoles
  "59": "ACC", // GT — Georgia Tech Yellow Jackets
  "87": "ACC", // ND — Notre Dame Fighting Irish
  "97": "ACC", // LOU — Louisville Cardinals
  "103": "ACC", // BC — Boston College Eagles
  "150": "ACC", // DUKE — Duke Blue Devils
  "152": "ACC", // NCSU — NC State Wolfpack
  "153": "ACC", // UNC — North Carolina Tar Heels
  "154": "ACC", // WAKE — Wake Forest Demon Deacons
  "183": "ACC", // SYR — Syracuse Orange
  "221": "ACC", // PITT — Pittsburgh Panthers
  "228": "ACC", // CLEM — Clemson Tigers
  "258": "ACC", // UVA — Virginia Cavaliers
  "259": "ACC", // VT — Virginia Tech Hokies
  "2390": "ACC", // MIA — Miami Hurricanes
  "2567": "ACC", // SMU — SMU Mustangs
  // Big Ten
  "26": "Big Ten", // UCLA — UCLA Bruins
  "30": "Big Ten", // USC — USC Trojans
  "77": "Big Ten", // NU — Northwestern Wildcats
  "84": "Big Ten", // IU — Indiana Hoosiers
  "120": "Big Ten", // MD — Maryland Terrapins
  "127": "Big Ten", // MSU — Michigan State Spartans
  "130": "Big Ten", // MICH — Michigan Wolverines
  "135": "Big Ten", // MINN — Minnesota Golden Gophers
  "158": "Big Ten", // NEB — Nebraska Cornhuskers
  "164": "Big Ten", // RUTG — Rutgers Scarlet Knights
  "194": "Big Ten", // OSU — Ohio State Buckeyes
  "213": "Big Ten", // PSU — Penn State Nittany Lions
  "264": "Big Ten", // WASH — Washington Huskies
  "275": "Big Ten", // WIS — Wisconsin Badgers
  "356": "Big Ten", // ILL — Illinois Fighting Illini
  "2294": "Big Ten", // IOWA — Iowa Hawkeyes
  "2483": "Big Ten", // ORE — Oregon Ducks
  "2509": "Big Ten", // PUR — Purdue Boilermakers
  // Big 12
  "9": "Big 12", // ASU — Arizona State Sun Devils
  "12": "Big 12", // ARIZ — Arizona Wildcats
  "38": "Big 12", // COLO — Colorado Buffaloes
  "66": "Big 12", // ISU — Iowa State Cyclones
  "197": "Big 12", // OKST — Oklahoma State Cowboys
  "239": "Big 12", // BAY — Baylor Bears
  "248": "Big 12", // HOU — Houston Cougars
  "252": "Big 12", // BYU — BYU Cougars
  "254": "Big 12", // UTAH — Utah Utes
  "277": "Big 12", // WVU — West Virginia Mountaineers
  "2116": "Big 12", // UCF — UCF Knights
  "2132": "Big 12", // CIN — Cincinnati Bearcats
  "2305": "Big 12", // KU — Kansas Jayhawks
  "2306": "Big 12", // KSU — Kansas State Wildcats
  "2628": "Big 12", // TCU — TCU Horned Frogs
  "2641": "Big 12", // TTU — Texas Tech Red Raiders
  // SEC
  "2": "SEC", // AUB — Auburn Tigers
  "8": "SEC", // ARK — Arkansas Razorbacks
  "57": "SEC", // FLA — Florida Gators
  "61": "SEC", // UGA — Georgia Bulldogs
  "96": "SEC", // UK — Kentucky Wildcats
  "99": "SEC", // LSU — LSU Tigers
  "142": "SEC", // MIZ — Missouri Tigers
  "145": "SEC", // MISS — Ole Miss Rebels
  "201": "SEC", // OU — Oklahoma Sooners
  "238": "SEC", // VAN — Vanderbilt Commodores
  "245": "SEC", // TA&M — Texas A&M Aggies
  "251": "SEC", // TEX — Texas Longhorns
  "333": "SEC", // ALA — Alabama Crimson Tide
  "344": "SEC", // MSST — Mississippi State Bulldogs
  "2579": "SEC", // SC — South Carolina Gamecocks
  "2633": "SEC", // TENN — Tennessee Volunteers
  // Big East
  "41": "Big East", // CONN — UConn Huskies
  "46": "Big East", // GTWN — Georgetown Hoyas
  "156": "Big East", // CREI — Creighton Bluejays
  "222": "Big East", // VILL — Villanova Wildcats
  "269": "Big East", // MARQ — Marquette Golden Eagles
  "305": "Big East", // DEP — DePaul Blue Demons
  "2086": "Big East", // BTLR — Butler Bulldogs
  "2507": "Big East", // PROV — Providence Friars
  "2550": "Big East", // HALL — Seton Hall Pirates
  "2599": "Big East", // SJU — St. John's Red Storm
  "2752": "Big East", // XAV — Xavier Musketeers
};

export function powerConferenceOfTeamId(teamId: string | number | null | undefined): PowerConference | null {
  if (teamId == null) return null;
  return POWER_CONFERENCE_BY_TEAM_ID[String(teamId)] ?? null;
}

// Both teams in a power conference — the second half of the CBB
// top-games rule (the first half is either team ranked).
export function isPowerConferenceGame(homeTeamId: string | number | null | undefined, awayTeamId: string | number | null | undefined): boolean {
  return powerConferenceOfTeamId(homeTeamId) != null && powerConferenceOfTeamId(awayTeamId) != null;
}
