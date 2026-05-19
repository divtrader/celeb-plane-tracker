// Seed list of celebrity-linked tail numbers.
// Public best-effort starting point — ownership changes frequently, so curate over time.
// `uncertain: true` flags entries that need verification before you trust their alerts.

export const CELEBRITY_TAILS = [
  { reg: "N898TS", name: "Taylor Swift",       aircraft: "Dassault Falcon 7X",        uncertain: true },  // reportedly sold 2024
  { reg: "N628TS", name: "Elon Musk",          aircraft: "Gulfstream G700",           uncertain: true },  // historic tail; G650ER→G700 unverified
  { reg: "N1980K", name: "Kim Kardashian",     aircraft: "Gulfstream G650ER" },
  { reg: "N887WM", name: "Bill Gates",         aircraft: "Bombardier BD-700",         uncertain: true },
  { reg: "N68885", name: "Mark Zuckerberg",    aircraft: "Gulfstream G650",           uncertain: true },
  { reg: "N767CJ", name: "Drake",              aircraft: "Boeing 767 (Air Drake)" },
  { reg: "N810KJ", name: "Kylie Jenner",       aircraft: "Bombardier Global 7500" },
  { reg: "N1980T", name: "Travis Scott",       aircraft: "Embraer EMB-135BJ",         uncertain: true },
  { reg: "N313MJ", name: "Jay-Z",              aircraft: "Bombardier Global 6000",    uncertain: true },
  { reg: "N540W",  name: "Oprah Winfrey",      aircraft: "Bombardier Global Express XRS" },
  { reg: "N86GE",  name: "Steven Spielberg",   aircraft: "Gulfstream G650" },                              // corrected from N86GB
  { reg: "N350JV", name: "Tom Cruise",         aircraft: "Gulfstream G450",           uncertain: true },
];
