// ADS-B source adapter interface.
//
// Implementations must export a class with:
//
//   async fetchByRegistration(reg) -> Aircraft | null
//
// Aircraft shape:
//   {
//     reg:      string,           // registration / tail number
//     icao:     string | null,    // ICAO 24-bit hex
//     lat:      number,
//     lon:      number,
//     alt:      number | null,    // feet (null when on ground)
//     speed:    number | null,    // knots
//     track:    number | null,    // degrees true
//     squawk:   string | null,
//     onGround: boolean,          // true when transponder reports ground state
//     seenAt:   number,           // ms since epoch
//   }
//
// Return null when the aircraft is not currently seen (no recent ADS-B fix).
// On-ground aircraft should still be returned with onGround=true — the caller
// uses that to detect takeoff/landing transitions.
//
// Swap implementations by changing the import in src/app.js.
