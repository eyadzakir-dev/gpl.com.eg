# Credits and licences

As of 2026-10-06, this site uses **no stock photography and no AI-generated images**. All imagery is original code-drawn SVG line art made for this site, plus the GPL logo.

## Brand: logo and name

| Item | Files | Rights |
| --- | --- | --- |
| Green Point Logistics logo (tile sphere and wordmark), the GPL mark and the company name | `assets/img/brand/` (`logo.webp`, `logo.svg`, `logo-white.svg`, `gpl-mark.svg`), the `<symbol id="gpl-mark">` in the header partial, `assets/favicon/`, `assets/og-image.png` | © Green Point Logistics. All rights reserved. These are trademarks and brand assets of Green Point Logistics (Three Stars Group). They are **not** covered by any code licence in this repository and may not be reused without permission. |

## Fonts

All fonts are self-hosted in `assets/fonts/` (WOFF2 subsets downloaded from Google Fonts; no third-party font requests). Their licence and copyright notices are in `assets/fonts/OFL.txt`.

| Font | Use | Designer | Licence |
| --- | --- | --- | --- |
| [Archivo](https://fonts.google.com/specimen/Archivo) (variable: width 62–125, weight 300–900) | Latin display and body text | Omnibus-Type | SIL Open Font License 1.1 |
| [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) (400, 500) | Mono labels, indices and numbers | IBM (Mike Abbink, Bold Monday) | SIL Open Font License 1.1 |
| [IBM Plex Sans Arabic](https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic) (400, 500, 600, 700) | Arabic text (`:lang(ar)`) | IBM (Mike Abbink, Bold Monday) | SIL Open Font License 1.1 |

## Code and data

| Item | Files | Licence |
| --- | --- | --- |
| [three.js](https://threejs.org/) r170 | `assets/js/vendor/three.module.min.js` | MIT. The full text is in `assets/js/vendor/three.LICENSE` (© 2010–2024 three.js authors). |
| [Natural Earth](https://www.naturalearthdata.com/) 1:50m land polygons | Land tiles of the routes globe, baked into `assets/js/globe/globe-data.js` | Public domain. No attribution is required; credited here as a courtesy. |
| [Natural Earth](https://www.naturalearthdata.com/) 1:10m geography | Coastlines and features of the Egypt port map, `assets/img/illo/port-map-egypt.svg` (Mercator; the map carries a "Natural Earth 1:10M" label) | Public domain. |
| Design system "The Production Line" | `assets/css/site.css`, `assets/js/site.js`, `scripts/serve.py` and patterns throughout | Adapted from the Three Stars Group's own site, threestarsfashion.com (same group). |

## Illustrations and icons

| Item | Files | Origin |
| --- | --- | --- |
| Line illustrations: vessel, gantry crane, container stack, truck, aircraft, warehouse racking, customs documents, RORO vessel, last-mile van, Egypt port map, clearance flow | `assets/img/illo/*.svg` | Original code-drawn SVG work for this site, in the Production Line technical-drawing style. Not stock and not AI-generated. The port map's geography comes from Natural Earth (see above). |
| Icons (24×24, `currentColor` stroke) | `assets/img/icons/*.svg` | Original code-drawn SVG work for this site. |
| GPL mark draw animation, globe pins and route arcs | `assets/css/site.css`, `assets/js/` | Original work for this site. |

The Egypt port map is drawn by code from Natural Earth data (public domain). It is illustrative and not meant for navigation.

## Photography placeholders

The site deliberately ships with illustrations instead of photos. When GPL supplies **real photographs of its own operations**, replace the placeholders below.

Photo rules:

- No factory photography. Show ports, containers, vessels, trucks, the warehouse, customs work and the office.
- No client names, cargo marks or logos without written permission.
- Get consent from anyone recognisable.
- Export as WebP, with explicit `width`/`height` and `loading="lazy"` below the fold.
- Write alt text in EN and AR.
- When a photo goes in, update this table (status, photographer and credit line).

| # | Page (EN / AR) | Location on page | Current placeholder | Photo wanted | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Home: `index.html` / `ar/index.html` | Hero | Code-drawn illustration and routes globe | GPL team or truck at an Alexandria/Dekheila container terminal, landscape | Wanted |
| 2 | Warehousing: `warehousing/index.html` / `ar/warehousing/index.html` | Service hero / intro figure | `assets/img/illo/warehouse-racking.svg` | GPL's warehouse: racking, loading bay, handling | Wanted |
| 3 | Domestic trucking: `domestic-trucking/index.html` / `ar/domestic-trucking/index.html` | Service hero / intro figure | `assets/img/illo/truck-container.svg` | GPL-operated or contracted truck being loaded or on the road | Wanted |
| 4 | Inland transportation: `inland-transportation/index.html` / `ar/inland-transportation/index.html` | Service hero / intro figure | `assets/img/illo/truck-container.svg` | Container on a chassis leaving a port gate | Wanted |
| 5 | About: `about-greenpoint/index.html` / `ar/about-greenpoint/index.html` | Team section | Code-drawn illustration | GPL team photo (with consent) | Wanted |
| 6 | About / Contact: `about-greenpoint/index.html`, `contact-us/index.html` (+ AR) | Office figure | Code-drawn illustration / port map | GPL office, El Manshya, Alexandria: entrance or front desk | Wanted |
| 7 | Customs clearance: `customs-clearance/index.html` / `ar/customs-clearance/index.html` | Service hero / intro figure | `assets/img/illo/customs-docs.svg` | Clearance team at work, document handling (no readable client data) | Optional |
