// Celebrity / notable-figure tail number registry.
//
// Most entries sourced from celebrityprivatejettracker.com (updated May 2026)
// plus targeted searches for billionaires and government aircraft.
// Curate over time — celebrity jet ownership changes frequently.
//
// Fields:
//   reg        — registration / tail number (queried via /v2/reg/<reg>)
//   icao       — ICAO 24-bit hex (optional; queried via /v2/hex/<hex> when present,
//                more reliable than reg for military and tail-blocked aircraft)
//   name       — display name
//   aircraft   — aircraft type for the voice line
//   descriptor — short "who they are" phrase, read into voice + event card
//                (e.g. "the pop star", "Tesla and SpaceX CEO"). Omit for
//                entries where the name speaks for itself (Air Force One).
//   category   — for future filtering / theming

export const CELEBRITY_TAILS = [
  // === Music ===
  { reg: "N621MM", name: "Taylor Swift",          aircraft: "Dassault Falcon 7X",          descriptor: "the pop star",                   category: "music" },
  { reg: "N767CJ", name: "Drake",                 aircraft: "Boeing 767 (Air Drake)",      descriptor: "the rapper",                     category: "music", wikipedia: "Drake (musician)" },
  { reg: "N44440", name: "Jay-Z & Beyoncé",       aircraft: "Bombardier Global 7500",      descriptor: "music's biggest couple",         category: "music" },
  { reg: "N1980K", name: "Kim Kardashian",        aircraft: "Gulfstream G650ER",           descriptor: "the reality TV star",            category: "music" },
  { reg: "N810KJ", name: "Kylie Jenner",          aircraft: "Bombardier Global 7500",      descriptor: "the cosmetics billionaire",      category: "music" },
  { reg: "N713TS", name: "Travis Scott",          aircraft: "Embraer E-190",               descriptor: "the rapper",                     category: "music" },
  { reg: "N1969C", name: "Diddy",                 aircraft: "Gulfstream V",                descriptor: "the music mogul",                category: "music", wikipedia: "Sean Combs" },
  { reg: "N474D",  name: "Lady Gaga",             aircraft: "Gulfstream V",                descriptor: "the pop star",                   category: "music" },
  { reg: "N71KR",  name: "Kid Rock",              aircraft: "Bombardier Challenger 600",   descriptor: "the rocker",                     category: "music" },
  { reg: "N7KC",   name: "Kenny Chesney",         aircraft: "Dassault Falcon 900",         descriptor: "the country star",               category: "music" },
  { reg: "N958TB", name: "Blake Shelton",         aircraft: "Gulfstream IV",               descriptor: "the country singer",             category: "music" },
  { reg: "N506AB", name: "Luke Bryan",            aircraft: "Learjet 60",                  descriptor: "the country singer",             category: "music" },
  { reg: "M-EDZE", name: "Elton John",            aircraft: "Bombardier Global Express XRS", descriptor: "the music icon",               category: "music" },

  // === Tech / Business ===
  { reg: "N628TS", name: "Elon Musk",             aircraft: "Gulfstream G650ER",           descriptor: "the Tesla and SpaceX CEO",       category: "tech" },
  { reg: "N272BG", name: "Elon Musk (G5)",        aircraft: "Gulfstream V",                descriptor: "the Tesla and SpaceX CEO",       category: "tech" },
  { reg: "N11AF",  name: "Jeff Bezos",            aircraft: "Gulfstream G700",             descriptor: "the Amazon founder",             category: "tech" },
  { reg: "N758PB", name: "Jeff Bezos (G650ER)",   aircraft: "Gulfstream G650ER",           descriptor: "the Amazon founder",             category: "tech" },
  { reg: "N887WM", name: "Bill Gates",            aircraft: "Gulfstream G650",             descriptor: "the Microsoft co-founder",       category: "tech" },
  { reg: "N194WM", name: "Bill Gates (2nd)",      aircraft: "Gulfstream G650",             descriptor: "the Microsoft co-founder",       category: "tech" },
  { reg: "N68885", name: "Mark Zuckerberg",       aircraft: "Gulfstream G650",             descriptor: "the Meta CEO",                   category: "tech" },
  { reg: "N3880",  name: "Mark Zuckerberg (G700)", aircraft: "Gulfstream G700",            descriptor: "the Meta CEO",                   category: "tech" },
  { reg: "N817GS", name: "Larry Ellison",         aircraft: "Gulfstream G650",             descriptor: "the Oracle founder",             category: "tech" },
  { reg: "N232G",  name: "Sergey Brin",           aircraft: "Gulfstream G650",             descriptor: "the Google co-founder",          category: "tech" },
  { reg: "N652WE", name: "Eric Schmidt",          aircraft: "Gulfstream G650",             descriptor: "the former Google CEO",          category: "tech" },
  { reg: "N650HA", name: "Marc Benioff",          aircraft: "Gulfstream G650",             descriptor: "the Salesforce CEO",             category: "tech" },
  { reg: "N878DB", name: "Peter Thiel",           aircraft: "Gulfstream V",                descriptor: "the PayPal co-founder",          category: "tech" },
  { reg: "N709DS", name: "Steve Ballmer",         aircraft: "Gulfstream G650",             descriptor: "the former Microsoft CEO",       category: "tech" },
  { reg: "N88WR",  name: "Steve Wynn",            aircraft: "Gulfstream V",                descriptor: "the casino mogul",               category: "business" },
  { reg: "N921MT", name: "Mark Cuban",            aircraft: "Bombardier Global Express",   descriptor: "the Shark Tank investor",        category: "business" },
  { reg: "N838MF", name: "Ronald Perelman",       aircraft: "Gulfstream G650",             descriptor: "the billionaire investor",       category: "business" },
  { reg: "N5MV",   name: "Michael Bloomberg",     aircraft: "Dassault Falcon 900",         descriptor: "the former New York mayor",      category: "business" },
  { reg: "N898NC", name: "Rupert Murdoch",        aircraft: "Gulfstream G650",             descriptor: "the media mogul",                category: "business" },
  { reg: "N221DG", name: "David Geffen",          aircraft: "Gulfstream G650",             descriptor: "the entertainment mogul",        category: "business" },
  { reg: "N1KE",   name: "Phil Knight (Nike)",    aircraft: "Gulfstream G650",             descriptor: "the Nike co-founder",            category: "business" },
  { reg: "N1DC",   name: "Jerry Jones",           aircraft: "Gulfstream V",                descriptor: "the Dallas Cowboys owner",       category: "business" },
  { reg: "N818TH", name: "Tommy Hilfiger",        aircraft: "Dassault Falcon 900",         descriptor: "the fashion designer",           category: "business" },
  { reg: "N737LE", name: "Len Blavatnik",         aircraft: "Boeing 737 BBJ",              descriptor: "the Warner Music owner",         category: "business" },
  { reg: "P4-BDL", name: "Roman Abramovich",      aircraft: "Boeing 787 Dreamliner",       descriptor: "the Russian oligarch",           category: "business" },

  // === Hollywood ===
  { reg: "N350XX", name: "Tom Cruise",            aircraft: "Bombardier Challenger 350",   descriptor: "the actor",                      category: "hollywood" },
  { reg: "N900KS", name: "Steven Spielberg",      aircraft: "Gulfstream G650",             descriptor: "the director",                   category: "hollywood" },
  { reg: "N540W",  name: "Oprah Winfrey",         aircraft: "Gulfstream G650",             descriptor: "the media mogul",                category: "hollywood" },
  { reg: "N162JC", name: "Jim Carrey",            aircraft: "Gulfstream V",                descriptor: "the comedian",                   category: "hollywood" },
  { reg: "N138GL", name: "George Lucas",          aircraft: "Gulfstream V",                descriptor: "the Star Wars creator",          category: "hollywood" },
  { reg: "N143MW", name: "Mark Wahlberg",         aircraft: "Bombardier Global Express",   descriptor: "the actor",                      category: "hollywood" },
  { reg: "N444WT", name: "Matt Damon",            aircraft: "Bombardier Global 7500",      descriptor: "the actor",                      category: "hollywood" },
  { reg: "N378TP", name: "Tyler Perry",           aircraft: "Embraer E-190",               descriptor: "the filmmaker",                  category: "hollywood" },
  { reg: "N6GU",   name: "Harrison Ford",         aircraft: "Cessna Citation Sovereign",   descriptor: "the actor",                      category: "hollywood" },
  { reg: "N4DP",   name: "Dr. Phil",              aircraft: "Gulfstream IV",               descriptor: "the TV host",                    category: "hollywood" },
  { reg: "N555QB", name: "Judge Judy",            aircraft: "Cessna Citation X",           descriptor: "the TV judge",                   category: "hollywood" },

  // === Athletics ===
  { reg: "N236MJ", name: "Michael Jordan",        aircraft: "Gulfstream V",                descriptor: "the basketball legend",          category: "athletics" },
  { reg: "N32MJ",  name: "Magic Johnson",         aircraft: "Gulfstream II",               descriptor: "the basketball legend",          category: "athletics" },
  { reg: "N517TW", name: "Tiger Woods",           aircraft: "Gulfstream V",                descriptor: "the golf legend",                category: "athletics" },
  { reg: "N151SD", name: "Floyd Mayweather",      aircraft: "Gulfstream IV",               descriptor: "the boxing champion",            category: "athletics" },
  { reg: "N313AR", name: "Alex Rodriguez",        aircraft: "Gulfstream IV",               descriptor: "the baseball legend",            category: "athletics" },
  { reg: "PH-DFT", name: "Max Verstappen",        aircraft: "Dassault Falcon 900EX",       descriptor: "the Formula 1 champion",         category: "athletics" },
  { reg: "LX-GOL", name: "Cristiano Ronaldo",     aircraft: "Bombardier Global Express XRS", descriptor: "the footballer",               category: "athletics" },
  { reg: "LV-IRQ", name: "Lionel Messi",          aircraft: "Gulfstream V",                descriptor: "the football legend",            category: "athletics" },
  { reg: "OK-HAR", name: "Zlatan Ibrahimović",    aircraft: "Cessna Citation 560XL",       descriptor: "the football icon",              category: "athletics" },
  { reg: "N1989R", name: "Rory McIlroy",          aircraft: "Gulfstream G650ER",           descriptor: "the golfer",                     category: "athletics" },

  // === Politics / Government ===
  { reg: "N757AF", icao: "AA3410", name: "Donald Trump (Trump Force One)", aircraft: "Boeing 757",   descriptor: "the 47th US president", category: "politics" },
  { reg: "82-8000", icao: "ADFDF8", name: "Air Force One (VC-25A)",        aircraft: "Boeing VC-25A",                                     category: "politics" },
  { reg: "92-9000", icao: "ADFDF9", name: "Air Force One backup (VC-25A)", aircraft: "Boeing VC-25A",                                     category: "politics" },
  { reg: "N943FL", name: "Ron DeSantis",          aircraft: "Cessna Citation Latitude",    descriptor: "the Florida governor",           category: "politics" },
];
