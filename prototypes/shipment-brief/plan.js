// Shipment-brief logic with no DOM access: form values in; plan, quote URL and WhatsApp text out.
// Facts come from docs/research/egypt-logistics-context.md (section numbers in the comments). Transit times are
// not in that file, so every sea, air and road leg reads "on request".

export const QUOTE_PATH = "../../quote";
export const WHATSAPP_NUMBER = "201222210198"; // TODO(confirm): WhatsApp number (BUILD-CONTRACT §10)

/** The query-parameter contract the quote form prefills from, in URL order. */
export const PARAM_ORDER = [
  "direction", "mode", "origin", "destination", "port",
  "container_type", "container_count", "weight_kg", "volume_cbm",
  "ready_date", "customs", "trucking",
];

const MAX_CONTAINERS = 99;
const MAX_PLACE_LENGTH = 40;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const MODES = {
  "sea-fcl": { label: "Sea FCL", long: "Sea, full container (FCL)", leg: "sea", portKind: "sea", cargo: "fcl" },
  "sea-lcl": { label: "Sea LCL", long: "Sea, shared container (LCL)", leg: "sea", portKind: "sea", cargo: "loose" },
  air: { label: "Air", long: "Air freight", leg: "air", portKind: "air", cargo: "loose" },
  land: { label: "Land", long: "Land (truck)", leg: "land", portKind: "sea", cargo: "loose" },
};

// Release averages: Customs Time Release Study 2024 (context §2, §6 [10]). Storage: Maersk import tariff (context §3 [13]).
export const PORTS = {
  alexandria: { label: "Alexandria", code: "EGALY", kind: "sea", releaseDays: 8.64, storage: "7 free days at Alexandria under Maersk’s tariff" },
  dekheila: { label: "Dekheila", code: "EGEDK", kind: "sea", releaseDays: 9.4 },
  damietta: { label: "Damietta", code: "EGDAM", kind: "sea", releaseDays: 8.09, storage: "5 free days at Damietta’s DACT terminal under Maersk’s tariff" },
  "port-said": { label: "Port Said", code: "EGPSD", kind: "sea" },
  sokhna: { label: "Sokhna", code: "EGSOK", kind: "sea" },
  cai: { label: "Cairo airport", code: "CAI", kind: "air" },
  hbe: { label: "Borg El Arab airport", code: "HBE", kind: "air" },
};

export const REGIONS = {
  europe: { label: "Europe", hub: "Rotterdam", airHub: "Frankfurt", market: "eu" },
  "turkey-east-med": { label: "Turkey & East Med", hub: "Mersin", airHub: "Istanbul" },
  gulf: { label: "Gulf", hub: "Jebel Ali", airHub: "Dubai", landHub: "Riyadh", market: "arab" },
  asia: { label: "Asia", hub: "Shanghai", airHub: "Shanghai" },
  "us-east-coast": { label: "US East Coast", hub: "New York", airHub: "New York", market: "us" },
  africa: { label: "Africa", hub: "Mombasa", airHub: "Nairobi", landHub: "Benghazi", market: "comesa" },
  egypt: { label: "Within Egypt", hub: "Greater Cairo", landHub: "Greater Cairo", domestic: true },
};

const LAND_REGIONS = new Set(["egypt", "africa", "gulf"]);
const RED_SEA_REGIONS = new Set(["gulf", "asia", "africa"]);

export const CONTAINERS = {
  "20-dry": { label: "20′ dry", plain: "20ft dry" },
  "40-dry": { label: "40′ dry", plain: "40ft dry" },
  "40-hc": { label: "40′ HC", plain: "40ft HC" },
  "20-reefer": { label: "20′ reefer", plain: "20ft reefer", reefer: true },
  "40-reefer": { label: "40′ reefer", plain: "40ft reefer", reefer: true },
};

// Published free time (context §3 [13][16][17]): dry 5-6 days, reefer 3-4, export detention 3-4.
const FREE_TIME = {
  importDry: { min: 5, max: 6, scale: 12 },
  importReefer: { min: 3, max: 4, scale: 12 },
  exportDetention: { min: 3, max: 4, scale: 8 },
};

export function isRegionAllowed(region, mode) {
  return mode === "land" ? LAND_REGIONS.has(region) : region !== "egypt";
}

/* ---------- Reading the form ---------- */

const pick = (value, table, fallback) => (Object.hasOwn(table, value) ? value : fallback);

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PLACE_LENGTH);
}

/** Normalises FormData (or anything with get()) into a brief. Unknown values fall back to the defaults. */
export function readBrief(data) {
  const mode = pick(data.get("mode"), MODES, "sea-fcl");
  const count = Math.round(Number(data.get("container_count")));
  const ready = String(data.get("ready_date") ?? "");
  return {
    direction: data.get("direction") === "export" ? "export" : "import",
    mode,
    port: pick(data.get("port"), PORTS, MODES[mode].portKind === "air" ? "cai" : "alexandria"),
    region: pick(data.get("region"), REGIONS, "asia"),
    place: cleanText(data.get("place")),
    containerType: pick(data.get("container_type"), CONTAINERS, "40-hc"),
    containerCount: Number.isFinite(count) ? Math.min(Math.max(count, 1), MAX_CONTAINERS) : 1,
    weightKg: positiveNumber(data.get("weight_kg")),
    volumeCbm: positiveNumber(data.get("volume_cbm")),
    readyDate: ISO_DATE.test(ready) ? ready : "",
    customs: data.get("customs") === "1",
    trucking: data.get("trucking") === "1",
  };
}

/* ---------- Labels ---------- */

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

export function cargoLabel(brief, { plain = false } = {}) {
  if (brief.mode === "sea-fcl") {
    const type = CONTAINERS[brief.containerType];
    return `${brief.containerCount} ${plain ? "x" : "×"} ${plain ? type.plain : type.label}`;
  }
  const parts = [];
  if (brief.weightKg) parts.push(`${numberFormat.format(brief.weightKg)} kg`);
  if (brief.volumeCbm) parts.push(`${numberFormat.format(brief.volumeCbm)} ${plain ? "cbm" : "m³"}`);
  return parts.length ? parts.join(" · ") : "Weight and volume to follow";
}

/** Readable origin and destination, as they prefill the quote form's free-text fields. */
export function describeEnds(brief) {
  const port = PORTS[brief.port];
  const region = REGIONS[brief.region];
  const egyptEnd = `${port.label}, Egypt`;
  if (region.domestic) {
    const inland = brief.place ? `${brief.place}, Egypt` : "Inside Egypt";
    return brief.direction === "import" ? { origin: egyptEnd, destination: inland } : { origin: inland, destination: egyptEnd };
  }
  const foreign = brief.place ? `${brief.place}, ${region.label}` : region.label;
  return brief.direction === "import" ? { origin: foreign, destination: egyptEnd } : { origin: egyptEnd, destination: foreign };
}

/** The far end's short name: what the user typed, or the region's lead port for the chosen mode. */
export function foreignName(brief) {
  const region = REGIONS[brief.region];
  if (brief.place) return brief.place;
  if (brief.mode === "air") return region.airHub;
  if (brief.mode === "land") return region.landHub ?? region.hub;
  return region.hub;
}

/* ---------- Quote URL and WhatsApp ---------- */

export function buildQuoteParams(brief) {
  const ends = describeEnds(brief);
  const values = {
    direction: brief.direction,
    mode: brief.mode,
    origin: ends.origin,
    destination: ends.destination,
    port: brief.port,
    ready_date: brief.readyDate,
    customs: brief.customs ? "1" : "0",
    trucking: brief.trucking ? "1" : "0",
  };
  if (brief.mode === "sea-fcl") {
    values.container_type = brief.containerType;
    values.container_count = String(brief.containerCount);
  } else {
    if (brief.weightKg) values.weight_kg = String(brief.weightKg);
    if (brief.volumeCbm) values.volume_cbm = String(brief.volumeCbm);
  }
  const params = new URLSearchParams();
  PARAM_ORDER.forEach((key) => { if (values[key]) params.set(key, values[key]); });
  return params;
}

export const buildQuoteUrl = (brief) => `${QUOTE_PATH}?${buildQuoteParams(brief)}`;

export function buildWhatsAppText(brief) {
  const ends = describeEnds(brief);
  const yesNo = (flag) => (flag ? "yes" : "no");
  return [
    "Hello Green Point Logistics, please quote this shipment:",
    `- ${brief.direction === "import" ? "Import into Egypt" : "Export from Egypt"}, ${MODES[brief.mode].long}`,
    `- From: ${ends.origin}`,
    `- To: ${ends.destination}`,
    `- Cargo: ${cargoLabel(brief, { plain: true })}`,
    `- Ready: ${brief.readyDate || "date to follow"}`,
    `- Customs clearance: ${yesNo(brief.customs)}. Trucking: ${yesNo(brief.trucking)}.`,
  ].join("\n");
}

export const buildWhatsAppUrl = (brief) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppText(brief))}`;

/* ---------- The plan ---------- */

export function usesRedSea(brief) {
  if (MODES[brief.mode].leg !== "sea") return false;
  return RED_SEA_REGIONS.has(brief.region) || brief.port === "sokhna";
}

const RED_SEA_NOTE = "Red Sea and Suez routings can change voyage by voyage.";
const TRANSIT_NOTE = "Transit depends on the line and the routing, so we confirm it with your booking.";

function step(id, title, text, when) {
  return { id, title, text, when };
}

function clearanceStep(ctx) {
  if (!ctx.brief.customs) return step("clear", "Clearance by your broker", "You chose freight only, so your broker clears the cargo. We hand over the documents.", "Your broker");
  if (ctx.isImport) return step("clear", "Customs clearance", "We file the declaration, show you every duty and tax before it is paid, and attend any inspection.", "From arrival");
  return step("clear", "Export clearance", "We file the export declaration and prepare the certificate of origin your buyer’s market asks for.", "Before loading");
}

function importSeaSteps(ctx) {
  const { brief, port, far, ready, isFcl } = ctx;
  const leg = `${TRANSIT_NOTE}${usesRedSea(brief) ? ` ${RED_SEA_NOTE}` : ""}`;
  return [
    // ACI: sea imports since Oct 2021; data 48 h before departure; 19-digit ACID on every document (context §1 [1][2]).
    step("aci", "ACI on Nafeza", `Shipment data goes on Nafeza at least 48 hours before the cargo leaves ${far}. You and your supplier get a 19-digit ACID, and it must appear on every document.`, "≥ 48 h before loading"),
    isFcl
      ? step("book", "Booking and loading", `We book ${cargoLabel(brief)} with the line and arrange loading at your supplier.`, ready)
      : step("book", "Booking and consolidation", "Your cargo goes to the consolidation warehouse at origin and sails in a shared container.", ready),
    step("cargox", "Documents on CargoX", "Your supplier uploads the invoice, bill of lading, packing list and certificate of origin (or EUR.1). We check that names, HS codes, values and weights match.", "≥ 48 h before arrival"),
    step("leg", `Sea leg to ${port.label}`, leg, "Transit on request"),
    // Clearance before the delivery order, June 2026 (context §1 [7]).
    isFcl
      ? step("arrive", "Arrival and discharge", "Free time starts at discharge. Since June 2026 clearance can start on arrival, without waiting for the line’s delivery order.", "Day 0")
      : step("arrive", "Arrival and unpacking", "The shared container is discharged and your cargo goes to the unpacking warehouse.", "Day 0"),
    clearanceStep(ctx),
    step("release", "Release and gate-out", isFcl ? "Once customs releases the container, it leaves the terminal." : "Your cleared cargo is released from the warehouse.", "On release"),
    finalImportStep(ctx),
  ];
}

function finalImportStep({ brief, isFcl }) {
  if (!brief.trucking) {
    return isFcl
      ? step("truck", "You collect", "Your truck collects the container. The empty goes back to the line’s depot before free time ends.", "Your truck")
      : step("truck", "You collect", "Your truck collects the cargo from the warehouse.", "Your truck");
  }
  return isFcl
    ? step("truck", "Trucking and empty return", "We truck the container to your site and plan the empty’s return to the line’s depot inside free time.", "Inside free time")
    : step("truck", "Delivery to your site", "We truck your cargo to your door.", "After release");
}

function importAirSteps(ctx) {
  const { brief, port, far, ready } = ctx;
  return [
    // Air ACI since 1 Jan 2026; documents 8 h before take-off (context §1 [2][3]).
    step("aci", "ACI on Nafeza (air)", `Air imports need an ACID too, since 1 January 2026. Shipment documents go in before the cargo leaves ${far}.`, "≥ 8 h before take-off"),
    step("book", "Booking and pickup", "We book space with an airline and arrange pickup at your supplier.", ready),
    step("leg", `Air leg to ${port.label}`, "Flights and transit are confirmed with your booking.", "Transit on request"),
    step("arrive", "Arrival", "Your cargo lands and goes into the airport cargo terminal.", "Day 0"),
    clearanceStep(ctx),
    step("release", "Release", "Cleared cargo is released from the cargo terminal.", "On release"),
    brief.trucking
      ? step("truck", "Delivery to your site", `We truck your cargo from ${port.label} to your door.`, "After release")
      : step("truck", "You collect", "Your truck collects the cargo from the terminal.", "Your truck"),
  ];
}

function exportSeaSteps(ctx) {
  const { brief, port, far, ready, isFcl } = ctx;
  const leg = `${TRANSIT_NOTE}${usesRedSea(brief) ? ` ${RED_SEA_NOTE}` : ""}`;
  const pickup = brief.trucking
    ? isFcl
      ? step("pickup", "Empty pickup and haulage", `We bring the empty container to your site, you load it, and we truck it to ${port.label}.`, ready)
      : step("pickup", "Pickup to the warehouse", `We collect your cargo and deliver it to the consolidation warehouse at ${port.label}.`, ready)
    : step("pickup", `You deliver to ${port.label}`, isFcl ? "Your truck brings the loaded container to the terminal." : "Your truck brings the cargo to the consolidation warehouse.", ready);
  return [
    // Sea exports need a Nafeza UCR since July 2026; bookings without it are rejected (context §1 [5]).
    step("ucr", "UCR on Nafeza", "Every sea export needs a 19-digit UCR from Nafeza. Carriers reject bookings without one, and the UCR and shipper cannot be changed later.", "Before booking"),
    step("book", "Booking", isFcl ? `We book ${cargoLabel(brief)} with the line under your UCR.` : "We book space in a shared container under your UCR.", ready),
    pickup,
    clearanceStep(ctx),
    step("leg", `Sea leg to ${far}`, leg, "Transit on request"),
    step("arrive", "Arrival at destination", "Your buyer’s broker clears the cargo. We send them the shipping documents.", "On request"),
    // Export rebate file (context §5 [40]).
    step("rebate", "Papers for your rebate file", "You receive the bill of lading and the customs export certificate for your export rebate file.", "After sailing"),
  ];
}

function exportAirSteps(ctx) {
  const { brief, port, far, ready } = ctx;
  return [
    step("book", "Booking", "We book space with an airline for your ready date.", ready),
    brief.trucking
      ? step("pickup", "Pickup to the airport", `We collect your cargo and truck it to ${port.label}.`, ready)
      : step("pickup", `You deliver to ${port.label}`, "Your truck brings the cargo to the airport cargo terminal.", ready),
    clearanceStep(ctx),
    step("leg", `Air leg to ${far}`, "Flights and transit are confirmed with your booking.", "Transit on request"),
    step("arrive", "Arrival at destination", "Your buyer’s broker clears the cargo. We send them the air waybill and documents.", "On request"),
  ];
}

function landSteps(ctx) {
  const { brief, port, far, ready, isImport } = ctx;
  const domestic = REGIONS[brief.region].domestic;
  const road = "Road time depends on the route and the gates, so we confirm it with your booking.";
  const steps = [
    step("book", domestic ? "Truck booking" : "Route and truck booking", domestic ? "We book a full or part truckload sized to your cargo." : "We plan the road route and the border crossing, and book the truck.", ready),
  ];
  if (isImport) {
    steps.push(domestic
      ? step("pickup", `Pickup at ${port.label}`, "We collect your cargo at the port once it is released.", "On release")
      : step("pickup", `Pickup in ${far}`, "Your cargo is collected at origin.", ready));
  } else {
    steps.push(step("pickup", "Pickup at your site", "We load at your site.", ready));
  }
  if (brief.customs) {
    steps.push(domestic
      ? step("clear", `Customs clearance at ${port.label}`, "We clear the cargo at the port before it moves.", "Before pickup")
      : step("clear", "Customs at the border", "We prepare the declarations for the border crossing.", "At the border"));
  }
  const destination = isImport ? (domestic ? brief.place || "your site" : port.label) : (domestic ? port.label : far);
  steps.push(step("leg", `Road leg to ${destination}`, road, "On request"));
  steps.push(step("deliver", "Delivery", isImport ? "We deliver and you sign for the cargo." : "We hand the cargo over at destination.", "On request"));
  return steps;
}

function computeSteps(ctx) {
  const { brief, isImport } = ctx;
  const leg = MODES[brief.mode].leg;
  if (leg === "land") return landSteps(ctx);
  if (leg === "air") return isImport ? importAirSteps(ctx) : exportAirSteps(ctx);
  return isImport ? importSeaSteps(ctx) : exportSeaSteps(ctx);
}

function computeTimeline({ brief, port, isImport }) {
  const leg = MODES[brief.mode].leg;
  const transit = { k: "Transit", v: "On request", note: "confirmed with your booking" };
  if (leg === "sea" && isImport) {
    const release = port.releaseDays
      ? { k: "Arrival → gate-out", v: `${numberFormat.format(port.releaseDays)} days`, note: `2024 average at ${port.label}` }
      : { k: "Arrival → gate-out", v: "On request", note: `no published average for ${port.label}` };
    return [
      { k: "ACID", v: "≥ 48 h", note: "before the cargo leaves origin" },
      { k: "CargoX documents", v: "≥ 48 h", note: "before the vessel arrives" },
      transit,
      release,
    ];
  }
  if (leg === "air" && isImport) return [{ k: "ACI documents", v: "≥ 8 h", note: "before take-off" }, transit, { k: "Arrival → release", v: "On request", note: "confirmed in your quote" }];
  if (leg === "sea") return [{ k: "UCR", v: "Before booking", note: "bookings without one are rejected" }, transit, { k: "Export clearance", v: "On request", note: "confirmed in your quote" }];
  if (leg === "air") return [transit, { k: "Export clearance", v: "On request", note: "confirmed in your quote" }];
  return [{ k: "Road time", v: "On request", note: "confirmed with your booking" }];
}

function computeWindow({ brief, port, isImport, isFcl }) {
  const leg = MODES[brief.mode].leg;
  if (isFcl && isImport) {
    const reefer = CONTAINERS[brief.containerType].reefer;
    const free = reefer ? FREE_TIME.importReefer : FREE_TIME.importDry;
    const carriers = reefer ? "Maersk 3, Hapag-Lloyd 4" : "Maersk 5, Hapag-Lloyd 6, Emirates Line 5";
    const text = [
      `Carriers publish ${free.min}–${free.max} free days on Egypt imports for ${reefer ? "reefers" : "dry containers"} (${carriers}), counted from discharge.`,
      port.releaseDays
        ? `In 2024 the average container at ${port.label} took ${numberFormat.format(port.releaseDays)} days to leave the port. That gap is why we start clearance on arrival.`
        : `There is no published release average for ${port.label}; we plan clearance around your last free day.`,
      port.storage ? `Terminal storage is billed separately, for example ${port.storage}.` : "Terminal storage is billed separately and confirmed in your quote.",
    ];
    return { kind: "gauge", title: "Free-time window", from: "from discharge", ...free, avg: port.releaseDays ?? null, avgLabel: port.label, text };
  }
  if (isFcl) {
    const free = FREE_TIME.exportDetention;
    return {
      kind: "gauge", title: "Export free days", from: "for the container", ...free, avg: null,
      text: ["Carriers publish 3–4 free days for an export container (Maersk 3, Hapag-Lloyd 4). We time the empty pickup to your ready date so loading fits inside them."],
    };
  }
  if (brief.mode === "sea-lcl") return { kind: "note", title: "Free days", text: ["Shared cargo moves through a warehouse, so container free time is the consolidator’s. Warehouse storage terms are confirmed in your quote."] };
  if (leg === "air") return { kind: "note", title: "Free days", text: ["No container free time applies by air. Airport storage terms are confirmed in your quote."] };
  return { kind: "note", title: "Free days", text: ["If the truck collects a container, the line’s free days apply. Send us the bill of lading and we count them for you."] };
}

const ORIGIN_CERTIFICATE = {
  eu: { label: "EUR.1 or EUR-MED certificate", note: "from GOEIC, for duty-free entry into the EU" },
  arab: { label: "GAFTA certificate of origin", note: "Arab League form, 40% local value added" },
  comesa: { label: "COMESA certificate of origin", note: "for COMESA members, 35% local value added" },
  us: { label: "Certificate of origin", note: "plus QIZ paperwork if your goods qualify" },
};

function computeDocs({ brief, isImport }) {
  const leg = MODES[brief.mode].leg;
  const domestic = REGIONS[brief.region].domestic;
  const docs = [{ label: "Commercial invoice" }, { label: "Packing list" }];
  if (domestic) {
    docs.push({ label: "Delivery address and site contact" });
    if (isImport && brief.customs) docs.push({ label: "Bill of lading or air waybill", note: "so we can clear before pickup" });
    return docs;
  }
  const transport = { sea: "Bill of lading", air: "Air waybill", land: "Road consignment note" }[leg];
  if (isImport) {
    docs.push({ label: transport, note: leg === "sea" ? "uploaded on CargoX by your supplier" : "" });
    docs.push({ label: "Certificate of origin or EUR.1", note: "from your supplier" });
    if (leg !== "land") {
      docs.push({ label: "Your ACID on every document", note: "including the " + (leg === "sea" ? "B/L" : "AWB") });
      docs.push({ label: "Importer account on Nafeza", note: "signed with an e-token" });
    }
    docs.push({ label: "HS codes for each item", note: "we help classify" });
    return docs;
  }
  if (leg === "sea") docs.push({ label: "UCR from Nafeza", note: "before booking" });
  const certificate = ORIGIN_CERTIFICATE[REGIONS[brief.region].market] ?? { label: "Certificate of origin", note: "from GOEIC" };
  docs.push(certificate);
  docs.push({ label: "Export rebate file", note: "B/L, customs export certificate, certificate of origin, bank proceeds notice" });
  return docs;
}

/** Everything the plan card shows, derived from the brief alone. */
export function computePlan(brief) {
  const isImport = brief.direction === "import";
  const port = PORTS[brief.port];
  const ctx = {
    brief,
    port,
    isImport,
    isFcl: brief.mode === "sea-fcl",
    far: foreignName(brief),
    ready: brief.readyDate ? `From ${formatDate(brief.readyDate)}` : "From your ready date",
  };
  // A domestic import runs port → inland, so the usual import order flips.
  const isInbound = isImport !== Boolean(REGIONS[brief.region].domestic);
  const route = isInbound ? [ctx.far, port.label] : [port.label, ctx.far];
  const routeCodes = isInbound ? [REGIONS[brief.region].label, port.code] : [port.code, REGIONS[brief.region].label];
  const steps = computeSteps(ctx);
  const title = `${isImport ? "Import" : "Export"} · ${MODES[brief.mode].label}`;
  return {
    title,
    route,
    routeCodes,
    isInbound,
    chips: [
      cargoLabel(brief),
      brief.readyDate ? `Ready ${formatDate(brief.readyDate)}` : "Ready date to follow",
      brief.customs ? "Customs clearance" : "No clearance",
      brief.trucking ? "Trucking" : "No trucking",
    ],
    steps,
    timeline: computeTimeline(ctx),
    window: computeWindow(ctx),
    docs: computeDocs(ctx),
    redSea: usesRedSea(brief),
    summary: `${title}, ${route.join(" to ")}, ${steps.length} steps.`,
  };
}
