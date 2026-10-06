# gpl.com.eg

This is the static website of **Green Point Logistics (GPL)**, the freight-forwarding and customs-clearance company of the Three Stars Group in Alexandria, Egypt. It replaces the WordPress site on Bluehost. It is built to bring in quote requests from Egyptian importers and exporters, in English and Arabic.

The site is hosted on GitHub Pages. The domain stays `gpl.com.eg`, but it moves only through the approved cutover in [CUTOVER.md](CUTOVER.md). The design system is a sibling of [threestarsfashion.com](https://threestarsfashion.com) ("The Production Line": paper, ink and hairlines, with GPL green instead of Three Stars red).

## Stack

- Hand-written HTML, CSS and vanilla ES modules. There is **no build step**, no framework, no `package.json` and no `node_modules`. The files in the repo are the files that get served.
- Each page is a standalone `.html` file. The shared head block, header and footer are copied into every page and kept identical by `scripts/sync_chrome.py`.
- `assets/css/site.css` and `assets/js/site.js` are shared. Pages may add their own stylesheet and script.
- Three.js (vendored, MIT) runs the routes globe and is only lazy-loaded. Every page works without WebGL.
- The tooling is Python 3 stdlib scripts in `scripts/`. Nothing needs installing.

## Structure

### URLs and files

GitHub Pages serves `/x` from `x.html` and `/x/` from `x/index.html`. The old WordPress slugs end in a slash and may have backlinks, so those pages are folders.

| Page | EN file | AR file | Public URL (EN / AR) |
| --- | --- | --- | --- |
| Home | `index.html` | `ar/index.html` | `/` · `/ar/` |
| Services hub | `services.html` | `ar/services.html` | `/services` · `/ar/services` |
| Sea freight | `sea-freight/index.html` | `ar/sea-freight/index.html` | `/sea-freight/` · `/ar/sea-freight/` |
| Air freight | `air-freight/index.html` | `ar/air-freight/index.html` | `/air-freight/` · `/ar/air-freight/` |
| Customs clearance | `customs-clearance/index.html` | `ar/customs-clearance/index.html` | `/customs-clearance/` · `/ar/customs-clearance/` |
| Inland transportation | `inland-transportation/index.html` | `ar/inland-transportation/index.html` | `/inland-transportation/` · `/ar/inland-transportation/` |
| Domestic trucking | `domestic-trucking/index.html` | `ar/domestic-trucking/index.html` | `/domestic-trucking/` · `/ar/domestic-trucking/` |
| Warehousing | `warehousing/index.html` | `ar/warehousing/index.html` | `/warehousing/` · `/ar/warehousing/` |
| RORO | `roro-services/index.html` | `ar/roro-services/index.html` | `/roro-services/` · `/ar/roro-services/` |
| Last-mile delivery | `last-mile-delivery/index.html` | `ar/last-mile-delivery/index.html` | `/last-mile-delivery/` · `/ar/last-mile-delivery/` |
| Industries | `industries.html` | `ar/industries.html` | `/industries` · `/ar/industries` |
| Network (tile sphere to trade-lane globe) | `network.html` | `ar/network.html` | `/network` · `/ar/network` |
| About | `about-greenpoint/index.html` | `ar/about-greenpoint/index.html` | `/about-greenpoint/` · `/ar/about-greenpoint/` |
| Request a Quote | `quote.html` | `ar/quote.html` | `/quote` · `/ar/quote` |
| Contact | `contact-us/index.html` | `ar/contact-us/index.html` | `/contact-us/` · `/ar/contact-us/` |
| Track Shipment | `track-your-shipment/index.html` | `ar/track-your-shipment/index.html` | `/track-your-shipment/` · `/ar/track-your-shipment/` |
| FAQ | `faq.html` | `ar/faq.html` | `/faq` · `/ar/faq` |
| Privacy policy | `privacy-policy.html` | `ar/privacy-policy.html` | `/privacy-policy` · `/ar/privacy-policy` |
| 404 | `404.html` (one bilingual page) | none | any missing URL |

Other root files:

| File | Purpose |
| --- | --- |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are, without running Jekyll. |
| `robots.txt` | Allows everything except `/prototypes/` and `/scripts/`, and points to the sitemap. |
| `sitemap.xml` | Hand-written. Every EN and AR page, with `hreflang` en/ar/x-default alternates. |
| `README.md`, `CUTOVER.md`, `CREDITS.md` | This file, the DNS cutover checklist, and credits and licences. |
| `CNAME` | **Not present yet.** It is added only during the approved cutover (see `CUTOVER.md`). |

### Assets and scripts

```text
assets/
  css/
    site.css              design system: tokens, grid, components, RTL rules
    service.css           shared service-page template (.svc-*)
    svc-<slug>.css        optional extra stylesheet for one service page
    <page>.css            page stylesheets (home, quote, ...)
  js/
    site.js               shared: header, mobile menu, clock, reveals, lightbox, globe loader
    <page>.js             page scripts (the quote form script, ...)
    home/                 homepage modules (clearance line, strings)
    sphere/               tile-sphere scene shared by the home hero and the network story
                          (logo-model.js, sphere.js, story.js); three.js loads only after engagement
    globe/                Three.js routes globe, lazy-imported by site.js for [data-globe]
    vendor/               three.module.min.js + three.LICENSE
  img/
    brand/                logo.webp, logo.svg, logo-white.svg, gpl-mark.svg
    illo/                 code-drawn SVG line illustrations (vessel, crane, truck, port map, ...)
    icons/                24x24 currentColor stroke icons
  fonts/                  self-hosted WOFF2 fonts (Archivo, IBM Plex Mono, IBM Plex Sans Arabic) + OFL.txt; @font-face rules are at the top of site.css
  favicon/                favicons and touch icons
  og-image.png            social share image
scripts/
  serve.py                local preview server with GitHub-Pages-style clean URLs
  sync_chrome.py          copies the shared head, header and footer into every page
  check_links.py          internal link and asset checker
  partials/               head/header/footer .en.html and .ar.html (the source of the shared chrome)
  templates/              starting files for new pages (EN/AR, generic and service)
prototypes/               home-page design explorations. Not linked from the site and disallowed in robots.txt
```

## Local preview

```sh
python3 scripts/serve.py . 8080
```

Then open <http://127.0.0.1:8080/>. Like GitHub Pages, the server maps `/services` to `services.html` and `/sea-freight/` to `sea-freight/index.html`. Use `127.0.0.1` or `localhost`, because the quote form only simulates success on those hosts (see below).

Like GitHub Pages, any path that does not exist (after the `.html` clean-URL check) gets `404.html` with status 404, for example <http://127.0.0.1:8080/no-such-page>.

## Shared chrome (head, header, footer)

Every page has three marker blocks:

```html
<!-- chrome:head -->   …favicons, fonts, theme colour, motion guard, analytics hook…   <!-- /chrome:head -->
<!-- chrome:header --> …skip link, header, mobile menu…                                <!-- /chrome:header -->
<!-- chrome:footer --> …footer…                                                         <!-- /chrome:footer -->
```

**Never edit inside the markers by hand.** Edit the partials and re-sync:

1. Change `scripts/partials/head.en.html`, `header.en.html`, `footer.en.html` and their `.ar.html` twins. Change both languages together.
2. Run:

   ```sh
   python3 scripts/sync_chrome.py              # update every page (skips scripts/)
   python3 scripts/sync_chrome.py --check      # report out-of-sync pages, exit 1 if any (use before committing)
   python3 scripts/sync_chrome.py ar/faq.html  # limit the run to some pages
   ```

The script is idempotent. It fills these placeholders for each page:

- `{{root}}` is the relative prefix to the site root (`""`, `../`, `../../`).
- `{{home}}` is the language home (`{{root}}` for EN, `{{root}}ar/` for AR).
- `{{alt}}` is the same page in the other language. If the twin file does not exist, it falls back to the other language's home.

The script also flags pages whose `<html lang>` does not match their folder (`ar/` must be `lang="ar"`).

Nav links carry `data-nav="<page key>"`, and the script adds `aria-current="page"` to the current one. Every service page also marks `services`.

Anything page-specific goes **outside** the markers: `<title>`, meta description, canonical, hreflang, Open Graph/Twitter, JSON-LD and page stylesheets.

## Link checking

```sh
python3 scripts/check_links.py            # whole repo (every .html outside scripts/)
python3 scripts/check_links.py quote.html # some pages only
```

Run it after every change to links, pages or assets, and before every commit. On any break it lists each broken reference and exits 1.

- It checks every internal link, asset and `#fragment` the way GitHub Pages resolves them, case-sensitively.
- It reports root-absolute paths (`/x`), because pages must use relative links.
- It ignores external `http(s):`, `mailto:` and `tel:` URLs. Check those by hand.

## Links are relative

Every internal link and asset path is **relative to the current file**, never root-absolute. That way the same files work on `gpl.com.eg` and on a project-pages preview at `https://<owner>.github.io/<repo>/`.

- From `index.html`: `assets/css/site.css`, `services`, `sea-freight/`.
- From `sea-freight/index.html`: `../assets/css/site.css`, `../services`, `../air-freight/`.
- From `ar/sea-freight/index.html`: `../../assets/...`, `../services` (the Arabic services page), `../../sea-freight/` (the English twin).
- Link folder pages with a trailing slash (`sea-freight/`) and file pages without the extension (`services`, `quote`). Home is `./`, `../`, and so on.
- Absolute `https://gpl.com.eg/...` URLs appear **only** in canonical, hreflang, Open Graph/Twitter, JSON-LD and `sitemap.xml`.
- `404.html` can be served at any path, so it inserts a `<base href>` at the top of its `<head>`. That is `/` on gpl.com.eg, and `/<repo>/` on `*.github.io`.
  The script assumes one of exactly two setups: the custom domain (or `127.0.0.1` / `localhost` with `scripts/serve.py` run from the repo root), or a **project-pages** preview at `https://<owner>.github.io/<repo>/`, where it takes the first path segment as the repo. A user/organisation site (`<owner>.github.io` serving this repo at its root) would need the base changed to `/`.

### Redirect stubs for old WordPress URLs

GitHub Pages has no server-side redirects, so old WordPress URLs that may have backlinks but no page of their own get a small HTML stub. Each stub has `<meta http-equiv="refresh" content="0; url=…">` with a **relative** target (so it also works on a project-pages preview), `<link rel="canonical">` to the absolute `https://gpl.com.eg/…` target, `<meta name="robots" content="noindex">`, and a visible link.

| Old URL (stub file) | Goes to |
| --- | --- |
| `/e-tools-technology/` (`e-tools-technology/index.html`) | `/services` |
| `/contact/` (`contact/index.html`) | `/contact-us/` |
| `/maritime-transport/` (`maritime-transport/index.html`) | `/sea-freight/` |
| `/blog/` (`blog/index.html`) | `/` (home) |
| `/destination-africa-8th-edition/` (`destination-africa-8th-edition/index.html`) | `/about-greenpoint/` |

The stubs are **not** in `sitemap.xml` and have no chrome markers, so `sync_chrome.py` skips them; `check_links.py` checks their links like any page. To add one, copy a stub, change the three URLs and the link text.

## Adding a page

1. **Pick the URL.** `foo.html` serves `/foo`, and `foo/index.html` serves `/foo/`. Use a folder only when the slug must keep a trailing slash.
2. **Start from a template** in `scripts/templates/`:
   - `page.en.html` and `page.ar.html` for a generic page;
   - `service.en.html` and `service.ar.html` for a service page;
   - `routes-snippet.*.html` for the routes globe block.

   Follow the instructions in the template's top comment and replace every `TODO(copy)`. Fix the relative paths for the file's depth.
3. **Fill in the head, outside the chrome markers:**
   - a unique `<title>`, ideally 60 characters or fewer
   - a meta description of 140–160 characters
   - a canonical URL
   - the hreflang trio: `en`, `ar`, and `x-default` (which points at the EN URL)
   - Open Graph and Twitter tags, with `og:locale` `en_US` or `ar_EG` and the other as the alternate
   - JSON-LD: `Service` on service pages, with `provider` set to `{"@id": "https://gpl.com.eg/#org"}`
4. **Create the Arabic twin** under `ar/` at the same relative path. Use `<html lang="ar" dir="rtl">`, `https://gpl.com.eg/ar/...` canonical and OG URLs, and the same hreflang trio.
5. **Add it to the navigation** in the header and/or footer partials if it belongs there. Give the link a `data-nav` key.
6. **Run `python3 scripts/sync_chrome.py`.** It fills the chrome blocks in the new files and updates the nav everywhere.
7. **Add two `<url>` entries to `sitemap.xml`,** one for EN and one for AR. Each needs `<lastmod>` and all three `xhtml:link` alternates. Copy an existing pair. Then check that the file is still valid XML:

   ```sh
   python3 -c "import xml.etree.ElementTree as E; E.parse('sitemap.xml'); print('ok')"
   ```

8. **Run `python3 scripts/check_links.py`.** Then preview both languages at 390px and 1440px wide.

## Arabic and RTL conventions

- Arabic pages live under `ar/` and mirror the EN file tree. Each has `<html lang="ar" dir="rtl">`.
- Write natural Egyptian business Arabic: the Modern Standard Arabic Egyptian logistics companies use, not colloquial slang. Use the terms in the copy deck glossary. When you are unsure of a term, keep your best version and add `<!-- TODO(ar-review): … -->` next to it.
- Fonts: Archivo has no Arabic glyphs. Under `:lang(ar)`, `--f-sans` switches to IBM Plex Sans Arabic. Arabic text gets no letter-spacing, no uppercase transforms and a slightly larger line height.
- The CSS uses **logical properties only**: `margin-inline-start`, `padding-inline`, `inset-inline-end`, `border-inline-start`, `text-align: start/end`. Do not add `left`/`right` or `margin-left`/`margin-right` to shared CSS.
- Directional icons (arrows, chevrons) flip under `[dir="rtl"]`.
- Phone numbers, emails, container numbers, B/L numbers, HS codes and times stay left-to-right. Wrap them in `<bdi>` or `<span dir="ltr">`.
- The language switch in the header uses `{{alt}}`, so every page needs its twin.

## Quote and contact forms: changing the endpoint

Both forms are `<form data-quote-form …>` elements run by `assets/js/quote-form.js`, and each posts to the URL in its own `data-endpoint` attribute. There are four forms, so change the attribute **in all four files**: `quote.html`, `ar/quote.html`, `contact-us/index.html` and `ar/contact-us/index.html`. No script changes are needed:

```html
<form class="iform" data-quote-form data-strings="quote-strings" data-endpoint="" …>
```

The script sends a `fetch` POST with `multipart/form-data` and an `Accept: application/json` header. Text values are trimmed. Fields hidden for the chosen transport mode are disabled, so they are not sent. Attachments are appended as repeated `files` parts: at most 10 files and 25 MB in total, of types pdf, xlsx, xls, csv, jpg, jpeg, png and webp. Any 2xx response counts as success, and if the JSON body has a `reference` string, the success panel shows it. Requests time out after 120 s. On an error, timeout or 429, the form shows a message with a retry button, plus "email instead" (a prefilled `mailto:info@gpl.com.eg`) and "WhatsApp instead" (a prefilled `wa.me` link) buttons.

A filled honeypot field (`website`) is treated as a bot: the script shows the normal success panel and sends nothing, so this works the same with every backend.

Field names the backend receives (from the form markup):

| Form | Fields |
| --- | --- |
| Quote (`quote.html`, `ar/quote.html`) | `name`\*, `company`\*, `email`\*, `phone`\*, `direction`\* (`import`, `export`, `cross-trade`), `mode`\* (`sea-fcl`, `sea-lcl`, `air`, `land`, `not-sure`), `origin_place`\*, `destination`\*, `egypt_port` (`alexandria`, `dekheila`, `damietta`, `port-said`, `sokhna`, `cairo-airport`, `borg-el-arab-airport`, `not-sure`), `incoterm` (`EXW` … `DDP`, `not-sure`), `ready_date` (`YYYY-MM-DD`), `cargo`, `hs_code`, `container_type` (`20gp`, `40gp`, `40hc`, `20rf`, `40rf`, `20ot`, `40ot`, `20fr`, `40fr`, `other`), `container_count`, `weight_kg`, `volume_cbm`, `needs_clearance` and `needs_trucking` (checkboxes, `1` when ticked), `message`, `files` |
| Contact (`contact-us/index.html`, `ar/contact-us/index.html`) | `name`\*, `company`, `email`\*, `phone`, `message`\* |
| Both (hidden) | `origin` = `gpl-website`, `form_type` = `quote` or `contact`, `lang` = `en` or `ar`, honeypot `website` (empty for people) |

\* required in the browser. The quote form also needs container type and count for FCL, or a weight or volume for the other modes (not for "not sure").

### Option 1: Fabrik (planned)

```html
data-endpoint="https://book.threestarsfashion.com/api/website/freight-quotes"
```

- **This route does not exist yet.** It is planned Fabrik work in a separate repo, and this repo must not change it. The existing Three Stars inquiries route is for garment inquiries and rejects `gpl.com.eg`, so do not point the form at it.
- Before switching, the Fabrik side needs:
  - the route, accepting `origin=gpl-website`
  - the route switched on
  - an exact Origin allowlist containing `https://gpl.com.eg` and `https://www.gpl.com.eg`

  Any other Origin gets a 403.
- Switch only **after the DNS cutover**. Until then, browsers send the github.io or localhost Origin, which the allowlist rejects.
- Check the preflight from the real Origin. Expect `204` with `access-control-allow-origin: https://gpl.com.eg`:

  ```sh
  curl -si -X OPTIONS \
    -H "Origin: https://gpl.com.eg" \
    -H "Access-Control-Request-Method: POST" \
    https://book.threestarsfashion.com/api/website/freight-quotes | head -20
  ```

- Fabrik answers `201 {"reference": "GPL-Q-YYYY-NNNNN"}` (planned format), and the success panel shows that reference. A 429 (too many requests) or 413 (too large) shows the form's normal error message.

### Option 2: Formspree (stopgap)

```html
data-endpoint="https://formspree.io/f/<FORM_ID>"
```

- Create a form in the Formspree dashboard and copy its ID from the integration tab. No hidden fields are required. Formspree uses the `email` field for reply-to.
- With `Accept: application/json`, Formspree returns JSON (`{"ok": true}`) and does not redirect. It returns no reference, so the success panel appears without one.
- Plan limits as of October 2026 (re-check at formspree.io/plans):
  - The free plan allows 50 submissions a month.
  - **File uploads need a paid plan.** Paid plans allow up to 25 MB per file and 100 MB per submission.

  On the free plan, remove the attachments field or upgrade. Test a submission with a file before going live.
- Formspree's own honeypot is `_gotcha`. It is optional here, because the script never sends honeypot hits.
- An optional hidden `<input type="hidden" name="_subject" value="GPL quote request">` sets the email subject.

### Option 3: Web3Forms (stopgap)

```html
data-endpoint="https://api.web3forms.com/submit"
```

Web3Forms also needs a hidden `access_key` **inside each form**, in all four files:

```html
<input type="hidden" name="access_key" value="<WEB3FORMS_ACCESS_KEY>">
```

- The access key comes from web3forms.com, which emails it to the address that will receive the submissions. It is public by design: it only maps to an inbox.
- Optional hidden fields: `subject` and `from_name`.
- Web3Forms returns JSON (`{"success": true, "message": "…"}`) with no reference.
- Plan limits as of October 2026 (re-check at web3forms.com/pricing):
  - The free plan allows 250 submissions a month.
  - **File uploads and domain restriction are Pro features.** Without Pro, remove the attachments field or test what happens to a submission with a file before going live.
- Web3Forms' own honeypot, a `botcheck` checkbox, is optional here.

With either stopgap, the quote data is held by a third party. Name the provider in `privacy-policy.html` and `ar/privacy-policy.html` before going live.

### When the endpoint is empty

`data-endpoint=""` is the shipped state.

- On `localhost` and `127.0.0.1` only, the script **simulates success** after a short delay, without a network request, and the success panel shows a sample reference marked as a preview. Use this to test validation and the success panel locally.
- On any other host, including `gpl.com.eg` and a `*.github.io` preview, the script **does not fake a success**. It shows "Online sending is not switched on yet." and opens the visitor's mail app with a `mailto:info@gpl.com.eg` message prefilled with their answers (attachments must be added by hand), with email and WhatsApp buttons as a backup. Nothing reaches GPL unless the visitor presses send, so set a real endpoint before the site goes live.

## Analytics

There is no analytics script and no account yet. The hook is the **`ANALYTICS HOOK (disabled)` comment block at the end of `scripts/partials/head.en.html` and `scripts/partials/head.ar.html`**. Through the sync, it ends up inside every page's `chrome:head` block. To enable analytics:

1. Choose **one** provider. Put its live `<script>` tag(s) **below** the comment block, in both head partials. Do not uncomment inside the block: the block is one HTML comment, and the examples in it are reference only.
2. Run `python3 scripts/sync_chrome.py` to copy it into every page, then run `python3 scripts/check_links.py`.
3. Update the analytics paragraph in `privacy-policy.html` and `ar/privacy-policy.html` to name the provider.

| Provider | Snippet (copy the exact one from the provider's dashboard) | Notes |
| --- | --- | --- |
| Cloudflare Web Analytics | `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "<TOKEN>"}'></script>` | Free. No cookies. Works without moving DNS to Cloudflare: add the site under Web Analytics and use the manual snippet. |
| Plausible | `<script async src="https://plausible.io/js/pa-<ID>.js"></script>` plus the short `plausible.init()` inline script from the dashboard | Paid after a trial. No cookies. The hook shows the shape of the current per-site snippet with a placeholder ID. Paste the exact snippet from your Plausible dashboard (Site settings → Site installation). |
| Google Analytics 4 | `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>` plus the inline `gtag('config', 'G-XXXXXXX')` block | Free. **Sets cookies**, so update the privacy policy accordingly and consider a consent banner. |

The site has no Content-Security-Policy today. If one is ever added, include the provider's script and beacon hosts.

## Deploy (GitHub Pages)

> Ask Aaron before you create the GitHub repo, make it public or enable Pages, and confirm which account owns it. On GitHub Free, Pages needs a **public** repo. A private repo needs GitHub Pro or Team, and the published site is public either way.

- **Source:** Settings → Pages → *Deploy from a branch* → `main` / `(root)`. That is the legacy build, with no Actions workflow. Every push to `main` publishes within a minute or two.
- **`.nojekyll`** at the root turns off Jekyll, so every file is served exactly as committed.
- **Preview before cutover:** because all links are relative, the site works at `https://<owner>.github.io/<repo>/`. The canonical and hreflang tags still point at `https://gpl.com.eg/`, so the preview does not compete in search.
- **Custom domain:** do **not** add a `CNAME` file or set a custom domain until the cutover is approved. Then follow [CUTOVER.md](CUTOVER.md). Email for `gpl.com.eg` lives on the same Bluehost server, so DNS mistakes break company email.
- **Limits** (GitHub docs):
  - The published site can be at most 1 GB.
  - Bandwidth has a soft limit of 100 GB a month.
  - Builds have a soft limit of 10 an hour.

  The site is static only: GitHub Pages has no server-side redirects and no server code.
- **Everything in a public repo is public,** including `prototypes/` and code comments. `robots.txt` only asks crawlers to skip those paths. Never commit private material. In particular, `TODO(confirm)` comments must not quote private sources.

## TODO markers

Open questions live in HTML comments next to the content they affect:

- **`TODO(confirm)`** marks facts that need Aaron's sign-off before they are published, for example:
  - the WhatsApp number (`https://wa.me/201222210198`)
  - company-profile claims the site holds back: "24/7 support", headcount, client names and logos, country counts and shipment volumes
  - source notes for numbers taken from the company profile
- **`TODO(ar-review)`** marks Arabic wording a native reviewer should check, in `ar/**` and the `.ar.html` partials.

To list them:

```sh
grep -rn "TODO(confirm)" --include=*.html .
grep -rn "TODO(ar-review)" --include=*.html .
```

Add `--exclude-dir=prototypes` to skip the home prototypes. When an item is resolved, update the content and delete its comment.
