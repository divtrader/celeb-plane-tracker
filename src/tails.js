// Celebrity / notable-figure tail number registry.
//
// Most entries sourced from celebrityprivatejettracker.com (updated May 2026)
// plus targeted searches for billionaires and government aircraft.
// Curate over time — celebrity jet ownership changes frequently.
//
// Fields:
//   reg       — registration / tail number (queried via /v2/reg/<reg>)
//   icao      — ICAO 24-bit hex (optional; queried via /v2/hex/<hex> when present,
//               more reliable than reg for military and tail-blocked aircraft)
//   name      — display name
//   aircraft  — aircraft type for the voice line
//   category  — for future filtering / theming

export const CELEBRITY_TAILS = [
  // === Music ===
  { reg: "N621MM", name: "Taylor Swift",          aircraft: "Dassault Falcon 7X",          category: "music" },
  { reg: "N767CJ", name: "Drake",                 aircraft: "Boeing 767 (Air Drake)",      category: "music" },
  { reg: "N44440", name: "Jay-Z & Beyoncé",       aircraft: "Bombardier Global 7500",      category: "music" },
  { reg: "N1980K", name: "Kim Kardashian",        aircraft: "Gulfstream G650ER",           category: "music" },
  { reg: "N810KJ", name: "Kylie Jenner",          aircraft: "Bombardier Global 7500",      category: "music" },
  { reg: "N713TS", name: "Travis Scott",          aircraft: "Embraer E-190",               category: "music" },
  { reg: "N1969C", name: "Diddy",                 aircraft: "Gulfstream V",                category: "music" },
  { reg: "N474D",  name: "Lady Gaga",             aircraft: "Gulfstream V",                category: "music" },
  { reg: "N71KR",  name: "Kid Rock",              aircraft: "Bombardier Challenger 600",   category: "music" },
  { reg: "N7KC",   name: "Kenny Chesney",         aircraft: "Dassault Falcon 900",         category: "music" },
  { reg: "N958TB", name: "Blake Shelton",         aircraft: "Gulfstream IV",               category: "music" },
  { reg: "N506AB", name: "Luke Bryan",            aircraft: "Learjet 60",                  category: "music" },

  // === Tech / Business ===
  { reg: "N628TS", name: "Elon Musk",             aircraft: "Gulfstream G650ER",           category: "tech" },
  { reg: "N272BG", name: "Elon Musk (G5)",        aircraft: "Gulfstream V",                category: "tech" },
  { reg: "N11AF",  name: "Jeff Bezos",            aircraft: "Gulfstream G700",             category: "tech" },
  { reg: "N758PB", name: "Jeff Bezos (G650ER)",   aircraft: "Gulfstream G650ER",           category: "tech" },
  { reg: "N887WM", name: "Bill Gates",            aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N194WM", name: "Bill Gates (2nd)",      aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N68885", name: "Mark Zuckerberg",       aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N3880",  name: "Mark Zuckerberg (G700)", aircraft: "Gulfstream G700",            category: "tech" },
  { reg: "N817GS", name: "Larry Ellison",         aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N232G",  name: "Sergey Brin",           aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N652WE", name: "Eric Schmidt",          aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N650HA", name: "Marc Benioff",          aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N878DB", name: "Peter Thiel",           aircraft: "Gulfstream V",                category: "tech" },
  { reg: "N709DS", name: "Steve Ballmer",         aircraft: "Gulfstream G650",             category: "tech" },
  { reg: "N88WR",  name: "Steve Wynn",            aircraft: "Gulfstream V",                category: "business" },
  { reg: "N921MT", name: "Mark Cuban",            aircraft: "Bombardier Global Express",   category: "business" },
  { reg: "N838MF", name: "Ronald Perelman",       aircraft: "Gulfstream G650",             category: "business" },
  { reg: "N5MV",   name: "Michael Bloomberg",     aircraft: "Dassault Falcon 900",         category: "business" },
  { reg: "N898NC", name: "Rupert Murdoch",        aircraft: "Gulfstream G650",             category: "business" },
  { reg: "N221DG", name: "David Geffen",          aircraft: "Gulfstream G650",             category: "business" },
  { reg: "N1KE",   name: "Phil Knight (Nike)",    aircraft: "Gulfstream G650",             category: "business" },
  { reg: "N1DC",   name: "Jerry Jones",           aircraft: "Gulfstream V",                category: "business" },
  { reg: "N818TH", name: "Tommy Hilfiger",        aircraft: "Dassault Falcon 900",         category: "business" },

  // === Hollywood ===
  { reg: "N350XX", name: "Tom Cruise",            aircraft: "Bombardier Challenger 350",   category: "hollywood" },
  { reg: "N900KS", name: "Steven Spielberg",      aircraft: "Gulfstream G650",             category: "hollywood" },
  { reg: "N540W",  name: "Oprah Winfrey",         aircraft: "Gulfstream G650",             category: "hollywood" },
  { reg: "N162JC", name: "Jim Carrey",            aircraft: "Gulfstream V",                category: "hollywood" },
  { reg: "N138GL", name: "George Lucas",          aircraft: "Gulfstream V",                category: "hollywood" },
  { reg: "N143MW", name: "Mark Wahlberg",         aircraft: "Bombardier Global Express",   category: "hollywood" },
  { reg: "N444WT", name: "Matt Damon",            aircraft: "Bombardier Global 7500",      category: "hollywood" },
  { reg: "N378TP", name: "Tyler Perry",           aircraft: "Embraer E-190",               category: "hollywood" },
  { reg: "N6GU",   name: "Harrison Ford",         aircraft: "Cessna Citation Sovereign",   category: "hollywood" },
  { reg: "N4DP",   name: "Dr. Phil",              aircraft: "Gulfstream IV",               category: "hollywood" },
  { reg: "N555QB", name: "Judge Judy",            aircraft: "Cessna Citation X",           category: "hollywood" },

  // === Athletics ===
  { reg: "N236MJ", name: "Michael Jordan",        aircraft: "Gulfstream V",                category: "athletics" },
  { reg: "N32MJ",  name: "Magic Johnson",         aircraft: "Gulfstream II",               category: "athletics" },
  { reg: "N517TW", name: "Tiger Woods",           aircraft: "Gulfstream V",                category: "athletics" },
  { reg: "N151SD", name: "Floyd Mayweather",      aircraft: "Gulfstream IV",               category: "athletics" },
  { reg: "N313AR", name: "Alex Rodriguez",        aircraft: "Gulfstream IV",               category: "athletics" },
  { reg: "PH-DFT", name: "Max Verstappen",        aircraft: "Dassault Falcon 900",         category: "athletics" },

  // === Politics / Government ===
  { reg: "N757AF", icao: "AA3410", name: "Donald Trump (Trump Force One)", aircraft: "Boeing 757", category: "politics" },
  { reg: "82-8000", icao: "ADFDF8", name: "Air Force One (VC-25A)",        aircraft: "Boeing VC-25A", category: "politics" },
  { reg: "92-9000", icao: "ADFDF9", name: "Air Force One backup (VC-25A)", aircraft: "Boeing VC-25A", category: "politics" },
  { reg: "N943FL", name: "Ron DeSantis",          aircraft: "Cessna Citation Latitude",    category: "politics" },
];
