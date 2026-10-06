// Geography for the GPL route globe: land as diamond tiles, Egypt's ports, destination ports and sea lanes.
// Land comes from Natural Earth 1:50m land polygons (public domain), baked into a checkerboard lattice of
// diamonds: rows every 2*step degrees of latitude, one diamond every 2*step ground degrees along each row.
// Each cell stores 2 bits of land coverage (0 sea, 1 coast, 2 mostly land, 3 land), packed 4 cells per byte:
// the share of a 0.1° land raster inside the diamond, cut at 16%, 42% and 72%. Egypt's tiles are listed by index.

const MIN_LAT = -58;

export const TILE_SETS = {
  fine: {
    step: 1.25,
    b64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAACAAwAAAAAAAAAAAAAAAAAAAAAAAAAAANADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAHQAAAAAAAAAADwAgAAAAAAAAAAAAAAAAAAQAFAAQAAAAAAAADAvwAAAAAAAAAAAAAAAAAAAFAAAAcAAAAAAAAAAP4LAAAAAAAAAAAAAAAAAAAA/AEAAQAAAAAAAAAA8P8BAAAAAAArAAAAAAAAAG6A/wIAAAAAAAAAAAAAwP8PAAAAAAD0DwAAAAAAAMD///8AAAAAAAAAAAAAAMD/PwAAAAAA9D8AAAAAAAAA////DwAAAAAAAAAAAAAA8P8PAAAAAAD8fwAAAAAAAAD///8fAAAAAAAAAAAAAAAA//8HAAAAAMD/P3AAAAAAAED///8LAAAAAAAAAAAAAAAA/P//AAAAAAD//8ADAAAAAADw//8vAAEAAAAAAAAAAAAAgP//PwAAAADQ/7/QAgAAAAAAAP//BwAAAAAAAAAAAAAAAND///8AAAAAQP//Hw4AAAAAAADgvzwAAAAAAAAAAAAAAAAA/v//PwAAAADA//8PCQAAAAAAAEA+DAAAAAAAAAAAAAAAAAD/////AAAAAAD//x8AAAAAAAAAABAQAAAAAAAAAAAAAAAAAPz///8PAAAAAPz/vwAAAAAAAABVBIAmAAAAAAAAAAAAAAAA4P////8CAAAAgP//DwAAAAAAABUAAPgXAQAAAAAAAAAAAAAA9P///y8AAAAA4P//DwAAAAAAwEElhb8AAAAAAAAAAAAAAAAA9P//vwAAAAAA9P//LwAAAAAAsPAjkAQAAAAAAAAAAAAAAAAA4P//DwAAAAAA8P//vwAAAAAAePRXBAAAAAAAAAAAAAAAAAAAwP//CwAAAAAA9P///wMAAAAAaYADAAAAAAAAAAAAAAAAAAAA0P9vAAAAAPiv/////wMAAAgADEBBAAAAAAAAAAAAAAAAAACA+v8BAAAAwP///////wAAoABABAAJAAAAAAAAAAAAAAAAAAADKgEAAACA//////9vCgDAAwDxACQAAAAAAAAAAAAAAAAA0AsAAAAAAID//////+8CAMADAP8CBAAAAAAAAAAAAAAAAIB+AQAAAAAA0P//////+AcA/AH4H8AAAAAAAAAAAAAAAADQnwOgAQAAAAD///////W/APQP9I9AAAAAAAAAAAAAAAAA8ENCAgAAAADQ/////3//P4D/y/8XAAAAAAAAAAAAAAAA1A8AAAAAAAAA/////z//f8D/////IwAAAAAAAAAAAAAA/gvAAAAAAACA//////cv/f////9/AAAAAAAAAAAAAAD+L8EAAAAAAAD///////P//////y8AAAAAAAAAAAAA+f//AwAAAAAA/P/fm/////////8PBAAAAAAAAAAA4P///wAAAAAAgP8LAPD///////8PaAAAAAAAAAAA/P//vwAAAAAAIH4ApP///////z9MBwAAAAAAAED///8vAAAAAMAPAPb/0/////8/DAgAAAAAAADA////HwAAAAD4EvN6P///////PxAAAAAAAADw////TwAAAED53R/4/f//////gwAAAAAAAPT///9fAAAAQP//7tv//////18AAAAAAAD+////cQAAAP3//////////28AAAAAAPD///+/AABA7P//////////CwQAAADQ///P/wAAwIn/////////L3AAAAHg///CHwAAkKD9//////8v0AAACv3/D3wBAACR4///////f5QA8P//v9AABgDg9///////vy7A////1cIDArT/////////5///vzx+FMCv//////8f/7+mHf4B4Ffq////DwT09fAPAEHk/+8CAHBZ8AsAEPhGAABU1j8AUKAQAADtHwhAAACA/wABAAAQAAAAAAA=',
    egypt: [4119, 4120, 4121, 4122, 4249, 4250, 4251, 4252, 4377, 4378, 4379, 4501, 4503],
  },
  coarse: {
    step: 1.5,
    b64: 'AAAAAAAEAAAAAAAAAAAAAAAAAAAAACQBAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAwAMAAAAAAAAAAAAAAACAAAAAAAAAQA8AAAAAAAAAAAAAAAAAYAAAAAAAAAAvAAAAAAAAAAAAAAAAQAAQAAAAAAAAAP8BAAAAAAAAAAAAAAAAPgAUAAAAAAAAAP0LAAAAAFQAAAAAAAAG5A8AAAAAAAAAAAD9HwAAAADwBwAAAAAA9Ov/AQAAAAAAAAAAQP8PAAAAAPwPAAAAAADw//8HAAAAAAAAAAAA8P8CAAAAgP8DAQAAAAD8//8DAAAAAAAAAAAAwP+/AAAAAPx/cAAAAABA//8/AAAAAAAAAAAAAOD//wAAAAD+v+AAAAAAAOD/PwAAAAAAAAAAAACA//8PAAAA8P8/HQAAAAAA8G8DAEAAAAAAAAAAAPT//w8AAADQ//8gAAAAAABAPQIAAAAAAAAAAAAA4P///wAAAAD+/wMAAAAAAAABAAEAAAAAAAAAAAAA////PwAAAMD/vwAAAAAApAEAbgAAAAAAAAAAAADA////CwAAAPD/PwAAAAAABhGAHwEAAAAAAAAAAADA//8/AAAAAPz//wAAAACA1yN0AQAAAAAAAAAAAABA//8DAAAAAPz//wMAAADA4lcBAAAAAAAAAAAAAAAA//8CAACABP7//w8AAACwAQcAAAAAAAAAAAAAAABQ/w8AAAD4/////w8AAAIgAGAAAAAAAAAAAAAAAACCrgAAAMD/////7wMADABxAAEAAAAAAAAAAAAAAB4AAAAAAP////+/AgCwAPgDBQAAAAAAAAAAAAD0BwAAAAAA/////88vALxA/gACAAAAAAAQAAAA0MdACQAAAOD///9//wvwH/wHAAAAAAAAAAAAAMAHZAAAAADg////r/8P/L//LwEAAAAAAAAAAID+AAEAAAAA/f//f/+V/v///wcAAAAAAAAAAOC/wAAAAAAA////++v/////PwAAAAAAAAAA8P//AAAAAAD/v23+//////8HAAAAAAAAAOD//x8AAAAA9B8A/P//////UgYAAAAAAAD///8BAAAA4BRh/9v/////IQgAAAAAAPD//z8AAADAS6j/z/////8PBAAAAAAA/v//CwAAALntB8//////PwUAAAAAwP///wYAAMD/73//////fwEAAAAA/f//mwAAQP////////8vAAAAAPj/v/8AANT+////////ggBAAPz/jy8AAEny//////+AAkCC/z+wAgAQaf//////gQD8///DQQMAzv//////OuH//5vi0EC7///////y//86PwD8/f7//w9KrR5/AAX4/78EwKX0AwDRHwEApf0BACQAAOgPAQAAYAMAAAAAAA==',
    egypt: [2807, 2808, 2809, 2810, 2916, 2917, 2918, 3023, 3024, 3025],
  },
};

/** Unit vector for a lat/lon where lon 0 faces +z and north is +y. */
export function latLonToVec(latDeg, lonDeg) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}

function latticeCells(step) {
  const cells = [];
  const rows = Math.round(180 / (2 * step));
  for (let k = 0; k < rows; k++) {
    const lat = -90 + (k + 0.5) * 2 * step;
    if (lat < MIN_LAT) continue;
    const n = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / (2 * step)));
    for (let j = 0; j < n; j++) cells.push([lat, -180 + ((j + 0.5) * 360) / n]);
  }
  return cells;
}

/** Land tiles of a set as { lat, lon, level (1-3), egypt }. */
export function landTiles(set) {
  const bytes = Uint8Array.from(atob(set.b64), (c) => c.charCodeAt(0));
  const egypt = new Set(set.egypt);
  const tiles = [];
  latticeCells(set.step).forEach(([lat, lon], i) => {
    const level = (bytes[i >> 2] >> ((i & 3) * 2)) & 3;
    if (level) tiles.push({ lat, lon, level, egypt: egypt.has(i) });
  });
  return tiles;
}

// Egypt's gateways (UN/LOCODE in the page tags). Dekheila sits 7 km west of Alexandria and shares its marker.
export const ORIGINS = {
  alex: { lat: 31.19, lon: 29.87 },
  damietta: { lat: 31.47, lon: 31.76 },
  portSaid: { lat: 31.26, lon: 32.31 },
  sokhna: { lat: 29.62, lon: 32.36 },
};

export const DESTINATIONS = {
  rotterdam: { lat: 51.95, lon: 4.05 },
  hamburg: { lat: 53.55, lon: 9.95 },
  valencia: { lat: 39.45, lon: -0.32 },
  genoa: { lat: 44.4, lon: 8.92 },
  piraeus: { lat: 37.94, lon: 23.62 },
  mersin: { lat: 36.78, lon: 34.64 },
  newYork: { lat: 40.62, lon: -73.95 },
  savannah: { lat: 32.08, lon: -81.09 },
  shanghai: { lat: 30.63, lon: 122.07 },
  ningbo: { lat: 29.93, lon: 121.86 },
  nhavaSheva: { lat: 18.95, lon: 72.95 },
  jebelAli: { lat: 25.01, lon: 55.06 },
  jeddah: { lat: 21.47, lon: 39.15 },
};

// Open-sea turning points, so lanes run through Gibraltar, Suez, Bab el-Mandeb and Malacca rather than over land.
const SEA = {
  creteSouth: [34.3, 25.0],
  sicily: [37.3, 11.6],
  sardiniaSouth: [38.3, 7.0],
  balearicSouth: [38.6, 1.2],
  tyrrhenian: [40.4, 11.9],
  corsicaEast: [42.4, 10.0],
  alboran: [36.1, -2.6],
  gibraltar: [35.95, -5.6],
  stVincent: [36.6, -9.9],
  finisterre: [43.3, -10.1],
  ushant: [48.6, -5.9],
  channel: [50.2, -1.0],
  dover: [51.1, 1.7],
  frisian: [53.75, 6.0],
  elbe: [54.0, 8.3],
  atlanticEast: [36.9, -16.0],
  atlanticMid: [39.6, -42.0],
  atlanticWest: [40.3, -66.0],
  carolinas: [33.8, -74.5],
  kasos: [35.3, 26.8],
  aegean: [36.7, 24.6],
  levant: [33.4, 33.9],
  cyprusEast: [35.6, 35.25],
  suezCanal: [30.6, 32.33],
  suez: [29.9, 32.56],
  gulfOfSuez: [28.4, 33.15],
  shadwan: [27.4, 34.0],
  redSeaNorth: [24.0, 36.5],
  redSeaMid: [19.5, 39.0],
  redSeaSouth: [15.2, 41.7],
  babElMandeb: [12.6, 43.4],
  aden: [12.4, 46.5],
  socotraNorth: [13.4, 52.0],
  arabianSea: [16.4, 63.0],
  laccadive: [9.0, 66.0],
  dondra: [5.5, 80.6],
  andaman: [6.1, 94.5],
  malacca: [3.0, 100.7],
  singapore: [1.2, 104.0],
  southChinaSea: [10.0, 110.2],
  luzonWest: [18.5, 115.0],
  taiwanStrait: [23.8, 119.2],
  zhoushan: [28.9, 122.9],
  omanSouth: [17.0, 57.8],
  rasAlHadd: [22.7, 60.3],
  hormuz: [26.4, 56.7],
  gulfWest: [25.9, 55.5],
};

const place = (key) => ORIGINS[key] || DESTINATIONS[key] || { lat: SEA[key][0], lon: SEA[key][1] };

/**
 * Lanes run port to port; a lane that starts at a SEA point is a spur off a trunk lane.
 * `region` matches the page pin (`data-pin`) the lane belongs to.
 */
const LANE_DEFS = [
  { region: 'northEurope', route: ['alex', 'creteSouth', 'sicily', 'sardiniaSouth', 'balearicSouth', 'alboran', 'gibraltar', 'stVincent', 'finisterre', 'ushant', 'channel', 'dover', 'rotterdam'] },
  { region: 'northEurope', route: ['dover', 'frisian', 'elbe', 'hamburg'] },
  { region: 'westMed', route: ['alex', 'creteSouth', 'sicily', 'sardiniaSouth', 'balearicSouth', 'valencia'] },
  { region: 'westMed', route: ['sicily', 'tyrrhenian', 'corsicaEast', 'genoa'] },
  { region: 'eastMed', route: ['alex', 'kasos', 'aegean', 'piraeus'] },
  { region: 'eastMed', route: ['damietta', 'levant', 'cyprusEast', 'mersin'] },
  { region: 'usEast', route: ['alex', 'creteSouth', 'sicily', 'sardiniaSouth', 'balearicSouth', 'alboran', 'gibraltar', 'atlanticEast', 'atlanticMid', 'atlanticWest', 'newYork'] },
  { region: 'usEast', route: ['atlanticMid', 'carolinas', 'savannah'] },
  { region: 'china', route: ['portSaid', 'suezCanal', 'suez', 'gulfOfSuez', 'shadwan', 'redSeaNorth', 'redSeaMid', 'redSeaSouth', 'babElMandeb', 'aden', 'socotraNorth', 'laccadive', 'dondra', 'andaman', 'malacca', 'singapore', 'southChinaSea', 'luzonWest', 'taiwanStrait', 'zhoushan', 'shanghai'] },
  { region: 'china', route: ['zhoushan', 'ningbo'] },
  { region: 'india', route: ['portSaid', 'suezCanal', 'suez', 'gulfOfSuez', 'shadwan', 'redSeaNorth', 'redSeaMid', 'redSeaSouth', 'babElMandeb', 'aden', 'socotraNorth', 'arabianSea', 'nhavaSheva'] },
  { region: 'gulf', route: ['sokhna', 'gulfOfSuez', 'shadwan', 'redSeaNorth', 'jeddah'] },
  { region: 'gulf', route: ['sokhna', 'gulfOfSuez', 'shadwan', 'redSeaNorth', 'redSeaMid', 'redSeaSouth', 'babElMandeb', 'aden', 'socotraNorth', 'omanSouth', 'rasAlHadd', 'hormuz', 'gulfWest', 'jebelAli'] },
];

/** Lanes as { region, points: [[lat, lon]...], fromPort, toPort } (ports get tapered ends). */
export const LANES = LANE_DEFS.map(({ region, route }) => ({
  region,
  points: route.map((key) => [place(key).lat, place(key).lon]),
  fromPort: !SEA[route[0]],
  toPort: !SEA[route[route.length - 1]],
}));

// Where each page pin sits: an origin port, or the lead port of a destination region.
export const PIN_PLACES = {
  alex: ORIGINS.alex,
  damietta: ORIGINS.damietta,
  portSaid: ORIGINS.portSaid,
  sokhna: ORIGINS.sokhna,
  northEurope: DESTINATIONS.rotterdam,
  westMed: DESTINATIONS.valencia,
  eastMed: DESTINATIONS.mersin,
  usEast: DESTINATIONS.newYork,
  china: DESTINATIONS.shanghai,
  india: DESTINATIONS.nhavaSheva,
  gulf: DESTINATIONS.jebelAli,
};
