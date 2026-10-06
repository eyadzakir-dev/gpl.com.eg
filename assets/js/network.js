/* Network page: the tile-sphere story. The hero sphere assembles beside the title, then (scroll) becomes the lane
 * globe: Egypt and its four gateways, lanes west, lanes east, an overview and a collapse into one green point.
 * three.js loads only after first paint (assets/js/sphere/story.js); without motion, WebGL2 or with Save-Data the
 * page keeps the SVG mark and the shared flat routes diagram.
 *
 * Strings contract (for ar/network.html, which reuses these scripts unchanged): every string JS writes comes from
 * <script type="application/json" id="network-strings">. Translate the values, keep the keys and {name} placeholders.
 *   locale        BCP 47 tag for the tile count (en-GB; Arabic "ar-EG" or "ar-EG-u-nu-latn").
 *   sphere.count  hero caption while the tiles land, e.g. "{n} tiles · 20 × 10 lattice"
 *   sphere.pause  / sphere.play   label of the hero's pause button
 *   sphere.view   globe HUD, e.g. "View {lat}°N · {lon}°{hemi}"; sphere.east / sphere.west fill {hemi}
 * Chapter labels for the globe HUD are the data-label attributes on .ts-ch; pins and captions are HTML.
 */
const root = document.querySelector('[data-sphere="story"]');

function readStrings() {
  const el = document.getElementById("network-strings");
  try {
    return el ? JSON.parse(el.textContent) : {};
  } catch (error) {
    console.error("Network: #network-strings is not valid JSON.", error);
    return {};
  }
}

if (root && document.documentElement.classList.contains("motion")) {
  const strings = readStrings();
  import("./sphere/story.js")
    .then(({ bootSphere }) => bootSphere(root, { mode: "story", strings: { locale: strings.locale, ...strings.sphere } }))
    .catch((error) => {
      root.classList.add("ts--flat");
      console.error("Network: the tile sphere module failed to load.", error);
    });
} else {
  root?.classList.add("ts--flat");
}
