# CUTOVER: moving gpl.com.eg to GitHub Pages

> **STOP. Do not run any step in this file without Aaron's explicit approval.**
>
> **Email for `gpl.com.eg` lives on the same Bluehost server as the WordPress site and the DNS zone** (`box2470.bluehost.com`, `50.87.140.26`). A wrong or missing DNS record can silently break company email (`info@`, `import@`, `export@`) and webmail. Change only the records listed here. Leave every other record exactly as it is.

**Placeholders:**

- `<owner>` is the GitHub user or organisation that owns the website repo. Aaron decides it; `eyadzakir-dev` owns the Three Stars site.
- `<repo>` is the repo name.

**Sources** (planning-repo research, checked 2026-10-06):

- `docs/research/current-website.md` §2: the DNS records.
- `docs/research/other-facts.md` §2: the runbook, GitHub values, Bluehost TTL and `.eg` registry.
- GitHub Docs: *Managing a custom domain for your GitHub Pages site*, *Verifying your custom domain for GitHub Pages*, *Securing your GitHub Pages site with HTTPS* and *Troubleshooting custom domains and GitHub Pages*.

## 0. Current state (2026-10-06)

- **Nameservers:** `ns1.bluehost.com` and `ns2.bluehost.com`. All edits are made in the Bluehost cPanel **Zone Editor**. DNS stays at Bluehost, so the cutover needs nothing from the `.eg` registry.
- **Zone transfer is refused.** The table below lists only the names that were probed, so the zone export in step 1 is the real source of truth.
- **TTL is 14400** (4 h) on every record. Bluehost's help pages say 14400 is also the *lowest accepted* value (see step 5).
- **There is no CAA record and no wildcard record.** Let's Encrypt can therefore issue GitHub's certificate. If anyone adds a CAA record later, it must allow `letsencrypt.org`.

| Name | Type | Current value | Action |
| --- | --- | --- | --- |
| `gpl.com.eg` | A | `50.87.140.26` | **Replace** with GitHub's A records (step 7) |
| `gpl.com.eg` | AAAA | none | **Add** GitHub's AAAA records (step 7) |
| `www` | CNAME | `gpl.com.eg.` | **Change** to `<owner>.github.io.` (step 7) |
| `webmail` | CNAME | `gpl.com.eg.` | **Change to** `A 50.87.140.26` (step 3) |
| `cpanel` | CNAME | `gpl.com.eg.` | **Change to** `A 50.87.140.26` (step 3) |
| `ftp` | CNAME | `gpl.com.eg.` | **Change to** `A 50.87.140.26` (step 3) |
| `gpl.com.eg` | TXT (SPF) | `v=spf1 a mx include:websitewelcome.com ~all` | **Rewrite** (step 4) |
| `_github-pages-challenge-<owner>` | TXT | none | **Add** and keep forever (step 2) |
| `gpl.com.eg` | MX | `0 mail.gpl.com.eg.` | Keep |
| `mail` | A | `50.87.140.26` | Keep |
| `default._domainkey` | TXT (DKIM) | `v=DKIM1; k=rsa; p=…` (two strings) | Keep |
| `_autodiscover._tcp` | SRV | `0 0 443 cpanelemaildiscovery.cpanel.net.` | Keep |
| `autodiscover`, `autoconfig`, `webdisk`, `whm`, `cpcalendars`, `cpcontacts` | A | `50.87.140.26` | Keep |
| `_dmarc` | TXT | none | Leave as is. DMARC is a separate, optional improvement |
| NS, SOA | | Bluehost | Keep |

## 1. Before you start (T-7 days)

- [ ] **Approvals.** Aaron approves:
  - the cutover;
  - the GitHub owner account and repo visibility (GitHub Free needs a public repo; a private repo needs Pro or Team, and the site itself is public either way);
  - a time window in quiet hours, for example the Egyptian Friday.

  Someone with the Bluehost cPanel login and someone with admin rights on the GitHub repo must both be available.
- [ ] **The site is live on the preview.** The repo is pushed and Pages is enabled with *Deploy from a branch*, `main` / `(root)`. The preview at `https://<owner>.github.io/<repo>/` has been reviewed and approved, and `python3 scripts/check_links.py` passes.
- [ ] **Mail-client audit.** Check every Outlook, phone and other mail account. The IMAP/POP/SMTP host must be `mail.gpl.com.eg` (or `box2470.bluehost.com`), **not** `gpl.com.eg` or `www.gpl.com.eg`. Anyone who opens webmail or cPanel through the bare domain (`gpl.com.eg/webmail`, `gpl.com.eg:2096`, `gpl.com.eg/cpanel`) must switch to `webmail.gpl.com.eg` or `cpanel.gpl.com.eg`.

  *Why:* after step 7 the bare domain points at GitHub, so anything that reaches Bluehost through it breaks.
- [ ] **Quote-form backend.** Decide which backend to use (see README, "Quote form"). The planned Fabrik route only accepts the `https://gpl.com.eg` Origin, so it is switched on after step 8.
- [ ] **WordPress stays untouched.** It is the rollback target. Optionally take a full cPanel backup first.

## 2. The cutover in steps

### Step 1: Export the zone (T-7)

- [ ] Open cPanel → Zone Editor → `gpl.com.eg` → **Manage**, and save every record. Use the export or download option if there is one. If not, take screenshots of every page and copy each record into a text file. This is the rollback reference.
- [ ] Copy the **full DKIM TXT value** (`default._domainkey`). It is published as two strings; take it from the zone, not from a web page.
- [ ] Snapshot what the authoritative server answers:

  ```sh
  NS=ns1.bluehost.com
  OUT="gpl-zone-before-$(date +%F).txt"
  for name in gpl.com.eg www mail webmail cpanel ftp autodiscover autoconfig webdisk whm cpcalendars cpcontacts; do
    host="$name"; [ "$name" = "gpl.com.eg" ] || host="$name.gpl.com.eg"
    for type in A AAAA CNAME MX TXT CAA; do dig @"$NS" +noall +answer "$host" "$type"; done
  done > "$OUT"
  dig @"$NS" +noall +answer default._domainkey.gpl.com.eg TXT >> "$OUT"
  dig @"$NS" +noall +answer _autodiscover._tcp.gpl.com.eg SRV >> "$OUT"
  ```

- [ ] Store the export **outside this public repo**, for example in the private planning repo or a password manager.
- [ ] Note any record in the export that is missing from the table in §0. Leave it untouched.

### Step 2: Verify the domain on GitHub (T-7)

Verification is takeover protection. Once `gpl.com.eg` is verified, only repos owned by `<owner>` can publish to it and its immediate subdomains, such as `www`. Without it, if the repo is deleted or Pages is switched off while DNS still points at GitHub, any GitHub user could claim the domain. Verify **before** adding the domain to the repo.

The handoff lists this step after the DNS switch. GitHub Docs and `other-facts.md` put it first, and this checklist follows them.

- [ ] Open the owner's **account settings**, not the repo settings:
  - personal account: profile **Settings → Pages → Add a domain**;
  - organisation: **Organization settings → Pages → Add a domain**.

  Enter `gpl.com.eg`.
- [ ] In the Zone Editor, add the TXT record GitHub shows:
  - Name: `_github-pages-challenge-<owner>.gpl.com.eg.`
  - Value: the code GitHub shows.
- [ ] Check that the record is visible, then click **Verify** (or **⋯ → Continue verifying**):

  ```sh
  dig _github-pages-challenge-<owner>.gpl.com.eg +nostats +nocomments +nocmd TXT
  ```

- [ ] **Never delete this TXT record.** The domain stays verified only while the record exists.

### Step 3: Detach `webmail`, `cpanel` and `ftp` from the apex (T-1 or earlier)

This changes nothing visible, because these names already resolve to the same IP. A name cannot hold a CNAME and an A record at the same time, so delete the CNAME first, then add the A record.

| Name | Delete | Add |
| --- | --- | --- |
| `webmail.gpl.com.eg` | `CNAME gpl.com.eg.` | `A 50.87.140.26` |
| `cpanel.gpl.com.eg` | `CNAME gpl.com.eg.` | `A 50.87.140.26` |
| `ftp.gpl.com.eg` | `CNAME gpl.com.eg.` | `A 50.87.140.26` |

- [ ] `dig @ns1.bluehost.com +short A webmail.gpl.com.eg` returns `50.87.140.26`. Run the same check for `cpanel` and `ftp`.
- [ ] `https://webmail.gpl.com.eg` and `https://cpanel.gpl.com.eg` still load their login pages.

### Step 4: Rewrite SPF (T-1 or earlier)

The `a` mechanism authorises whatever the apex points to. After the cutover, that would let GitHub's servers send mail as `gpl.com.eg`. The fix names Bluehost's IP explicitly instead.

- [ ] **Edit** the existing SPF TXT record. Do not add a second one: two `v=spf1` records make SPF fail with a permerror.
  - Old: `v=spf1 a mx include:websitewelcome.com ~all`
  - New: `v=spf1 mx ip4:50.87.140.26 include:websitewelcome.com ~all`
- [ ] `dig @ns1.bluehost.com +short TXT gpl.com.eg` shows exactly one `v=spf1` string, and it is the new one.
- [ ] Send a test email from `info@gpl.com.eg` to an external Gmail address. Open it and choose *Show original*. It shows `SPF: PASS` and `DKIM: PASS`.

### Step 5: Lower the TTLs (T-1: at least 24 h before step 7)

- [ ] Set the TTL of the apex `A` record and the `www` CNAME from 14400 to **300**.
- [ ] Bluehost's help pages say 14400 is the *lowest accepted* TTL, so the Zone Editor may reject 300. If it does, either ask Bluehost support to lower the TTL, or keep 14400 and plan for **up to 4 hours** of mixed answers during the cutover and during any rollback.
- [ ] Wait out at least one old TTL (4 h); 24 h is safer. Then confirm the TTL column:

  ```sh
  dig @ns1.bluehost.com gpl.com.eg A
  ```

### Step 6: Add the `CNAME` file and the custom domain (T-1, or immediately before step 7)

GitHub wants the repo to claim the domain **before** DNS points at GitHub. From this moment, `https://<owner>.github.io/<repo>/` redirects to `gpl.com.eg`, which keeps serving WordPress until step 7 propagates. Doing this right before step 7 shortens that window.

- [ ] Add a file named `CNAME` at the repo root and commit it to `main`. It contains exactly one line: `gpl.com.eg`. No `https://`, no `www`.
- [ ] In repo **Settings → Pages → Custom domain**, enter `gpl.com.eg` and click Save. With branch publishing, saving here also commits a `CNAME` file. Make sure only one exists and it contains `gpl.com.eg`.

  The apex is the canonical host, so GitHub will redirect `www` to it.
- [ ] The DNS check on the settings page fails until step 7 propagates. That is expected.

### Step 7: Point the apex and `www` at GitHub (T-0)

Checked against GitHub Docs (*Managing a custom domain for your GitHub Pages site*) on 2026-10-06:

| Name | Delete | Add |
| --- | --- | --- |
| `gpl.com.eg` | `A 50.87.140.26` | `A 185.199.108.153` |
| `gpl.com.eg` | | `A 185.199.109.153` |
| `gpl.com.eg` | | `A 185.199.110.153` |
| `gpl.com.eg` | | `A 185.199.111.153` |
| `gpl.com.eg` | | `AAAA 2606:50c0:8000::153` |
| `gpl.com.eg` | | `AAAA 2606:50c0:8001::153` |
| `gpl.com.eg` | | `AAAA 2606:50c0:8002::153` |
| `gpl.com.eg` | | `AAAA 2606:50c0:8003::153` |
| `www.gpl.com.eg` | `CNAME gpl.com.eg.` | `CNAME <owner>.github.io.` (no repo name) |

- [ ] When you are done, the apex has **only** these four A and four AAAA records. Any extra or leftover A/AAAA record blocks the certificate.
- [ ] `www` must point at `<owner>.github.io`, not at the apex. Pointing it at the apex breaks HTTPS enforcement.
- [ ] Never add wildcard records (`*.gpl.com.eg`).
- [ ] Touch nothing else: not MX, `mail`, DKIM, SRV or any other host. SPF was already changed in step 4.

### Step 8: Certificate and HTTPS (T-0, then up to 24 h)

- [ ] In repo Settings → Pages, wait for the DNS check to pass. GitHub then requests a Let's Encrypt certificate for `gpl.com.eg` and `www.gpl.com.eg`. GitHub says this can take up to an hour.
- [ ] If the certificate is still stuck after DNS is correct, click **Remove**, re-enter `gpl.com.eg` and click **Save** to restart provisioning.
- [ ] Tick **Enforce HTTPS** once it becomes available. GitHub says that can take up to 24 h. Do not skip this step.
- [ ] Check the redirects: `http://` goes to `https://`, and `https://www.gpl.com.eg` goes to `https://gpl.com.eg/` (see §4).

### Step 9: Keep the Bluehost plan

- [ ] **Do not cancel or downgrade the Bluehost hosting plan.** It hosts the mailboxes and the DNS zone, and cancelling it deletes both.
- [ ] Leave the WordPress files on Bluehost until Aaron decides to decommission them. That is a separate approved step, and WordPress is the rollback target until then.

  To view WordPress after the cutover, add a hosts-file entry that points `gpl.com.eg` at `50.87.140.26`.
- [ ] Expect cPanel AutoSSL warning emails about the apex and `www`, which no longer validate at Bluehost. Confirm that the next AutoSSL run still covers `mail` and `webmail`.

## 3. Do not touch

- `MX 0 mail.gpl.com.eg.`
- `mail.gpl.com.eg  A 50.87.140.26`
- `default._domainkey` TXT (DKIM)
- `_autodiscover._tcp` SRV
- every other `A 50.87.140.26` host: `autodiscover`, `autoconfig`, `webdisk`, `whm`, `cpcalendars`, `cpcontacts` (and, after step 3, `webmail`, `cpanel` and `ftp`)
- NS and SOA
- the `_github-pages-challenge-<owner>` TXT record, once it is added
- any record in the zone export that this file does not mention
- the WordPress files and database on Bluehost

## 4. Post-cutover checks

### DNS

Run these against the authoritative server first, then against public resolvers:

```sh
for r in ns1.bluehost.com 1.1.1.1 8.8.8.8; do
  echo "== $r"
  dig @$r +short A gpl.com.eg              # 185.199.108.153 … 185.199.111.153
  dig @$r +short AAAA gpl.com.eg           # 2606:50c0:8000::153 … 2606:50c0:8003::153
  dig @$r +short CNAME www.gpl.com.eg      # <owner>.github.io.
  dig @$r +short MX gpl.com.eg             # 0 mail.gpl.com.eg.
  dig @$r +short A mail.gpl.com.eg         # 50.87.140.26
  dig @$r +short A webmail.gpl.com.eg      # 50.87.140.26
  dig @$r +short A cpanel.gpl.com.eg       # 50.87.140.26
  dig @$r +short A ftp.gpl.com.eg          # 50.87.140.26
  dig @$r +short TXT gpl.com.eg            # exactly one: v=spf1 mx ip4:50.87.140.26 include:websitewelcome.com ~all
  dig @$r +short TXT default._domainkey.gpl.com.eg   # DKIM, unchanged from the export
  dig @$r +short SRV _autodiscover._tcp.gpl.com.eg   # 0 0 443 cpanelemaildiscovery.cpanel.net.
  dig @$r +short TXT _github-pages-challenge-<owner>.gpl.com.eg
done
```

### Website

```sh
curl -sI https://gpl.com.eg/ | grep -iE '^(HTTP|server)'                # HTTP/2 200, server: GitHub.com
curl -sI http://gpl.com.eg/ | grep -iE '^(HTTP|location)'               # 301 -> https://gpl.com.eg/ (after Enforce HTTPS)
curl -sI https://www.gpl.com.eg/ | grep -iE '^(HTTP|location)'          # 301 -> https://gpl.com.eg/
curl -sI https://gpl.com.eg/sea-freight | grep -iE '^(HTTP|location)'   # 301 -> /sea-freight/
curl -sI https://gpl.com.eg/no-such-page | head -1                      # 404 (the custom 404 page)
```

The old WordPress slugs and every new page must return 200, in both languages:

```sh
for p in "" services sea-freight/ air-freight/ customs-clearance/ inland-transportation/ \
         domestic-trucking/ warehousing/ roro-services/ last-mile-delivery/ industries \
         about-greenpoint/ quote contact-us/ track-your-shipment/ faq privacy-policy; do
  for prefix in "" "ar/"; do
    printf '%s  /%s%s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://gpl.com.eg/$prefix$p")" "$prefix" "$p"
  done
done
for f in robots.txt sitemap.xml; do curl -s -o /dev/null -w "%{http_code}  /$f\n" "https://gpl.com.eg/$f"; done
```

- [ ] Old WordPress URLs that are not in that list now return 404 by design. These are the Globefarer demo pages (team, careers, shop, sample posts). If backlinks matter for any of them (for example `/contact/`), add a meta-refresh redirect stub before the cutover.
- [ ] In a browser over HTTPS, check the padlock, EN and AR, the mobile menu and the quote page.

### Email (most important)

- [ ] From an external account (for example Gmail), send to `info@`, `import@` and `export@gpl.com.eg`. All three arrive.
- [ ] From `info@gpl.com.eg`, send to Gmail. *Show original* shows `SPF: PASS` and `DKIM: PASS` (`d=gpl.com.eg`).
- [ ] `https://webmail.gpl.com.eg` logs in, `https://cpanel.gpl.com.eg` loads, and phones and Outlook still sync.
- [ ] Optional: score a message at mail-tester.com.

### Search, form, TTL

- [ ] **Google Search Console:** add a Domain property for `gpl.com.eg`. Its verification TXT is a separate TXT record at the apex; never merge it into the SPF string. Submit `https://gpl.com.eg/sitemap.xml`, then request indexing of `/` and `/ar/`.
- [ ] Optional: Bing Webmaster Tools, which can import from Search Console.
- [ ] **Quote form:** if the backend is Fabrik, switch the route on now and run the preflight `curl` from the README. With any backend, submit one real test quote from `https://gpl.com.eg/quote` and confirm that GPL receives it.
- [ ] After a week with no problems, raise the TTLs back to 14400.

## 5. Rollback (any time)

WordPress was never touched, so it serves again as soon as DNS returns. The rollback takes effect within the TTL in use: minutes at 300, or up to 4 hours at 14400.

1. [ ] **Apex:** in the Zone Editor, delete the four GitHub `A` records and the four `AAAA` records, then re-add `A 50.87.140.26`.
2. [ ] **`www`:** set the CNAME back to `gpl.com.eg.`
3. [ ] **GitHub:** remove the custom domain in repo Settings → Pages and delete the `CNAME` file from `main`. That brings back the preview at `https://<owner>.github.io/<repo>/`. (`other-facts.md` notes this step is optional once the domain is verified.)
4. [ ] **Keep the safe changes:**
   - the `webmail`, `cpanel` and `ftp` A records;
   - the new SPF;
   - the `_github-pages-challenge-<owner>` TXT record.

   They are correct whichever host serves the website.
5. [ ] **Certificate:** if AutoSSL has already reissued the certificate without the apex, run **cPanel → SSL/TLS Status → Run AutoSSL** so WordPress serves HTTPS again.
6. [ ] Re-run the DNS and email checks in §4.

## 6. Open items

- Aaron needs to decide which GitHub account or organisation owns the repo (`<owner>`), and whether the repo is public.
- Find out who holds the `.eg` registration. It is not needed for this cutover, but moving nameservers (for example to Cloudflare) is a signed, stamped form sent to the registry.
- DMARC is missing. Adding `v=DMARC1; p=none; rua=mailto:…` at `_dmarc` is a separate, optional improvement.
