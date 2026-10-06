#!/usr/bin/env python3
"""Copy the shared head, header and footer into every page (stdlib only, idempotent).

Pages hold marker blocks:
    <!-- chrome:head --> ... <!-- /chrome:head -->
    <!-- chrome:header --> ... <!-- /chrome:header -->
    <!-- chrome:footer --> ... <!-- /chrome:footer -->
Each block is replaced with scripts/partials/<block>.<lang>.html, rendering:
    {{root}}  relative prefix to the site root ("", "../", "../../")
    {{home}}  relative prefix to the language home (EN = {{root}}, AR = {{root}}ar/)
    {{alt}}   relative URL of the same page in the other language (other home for unknown pages)
and adding aria-current to links whose data-nav matches the page key.

Usage:
    python3 scripts/sync_chrome.py            # update every page in the repo
    python3 scripts/sync_chrome.py --check    # report pages that are out of sync, exit 1 if any
    python3 scripts/sync_chrome.py FILE ...   # limit to some pages
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTIALS = ROOT / "scripts" / "partials"
BLOCKS = ("head", "header", "footer")
SKIP_DIRS = {".git", "scripts", "node_modules", ".playwright-mcp", ".github", ".vscode"}

SERVICE_KEYS = {
    "sea-freight/", "air-freight/", "customs-clearance/", "inland-transportation/",
    "domestic-trucking/", "warehousing/", "roro-services/", "last-mile-delivery/",
}
# Pages that exist in both languages (BUILD-CONTRACT section 2).
MIRRORED_KEYS = SERVICE_KEYS | {
    "home", "services", "industries", "network", "about-greenpoint/", "quote", "contact-us/",
    "track-your-shipment/", "faq", "privacy-policy",
}

BLOCK_RE = {
    name: re.compile(r"(<!-- chrome:%s -->)(.*?)(<!-- /chrome:%s -->)" % (name, name), re.S)
    for name in BLOCKS
}
NAV_LINK_RE = re.compile(r'<a\b[^>]*\bdata-nav="([^"]*)"[^>]*>')


def page_info(path):
    """Language, depth, page key and URL of a page, from its repo-relative path."""
    rel = path.relative_to(ROOT).as_posix()
    parts = rel.split("/")
    lang = "ar" if parts[0] == "ar" and len(parts) > 1 else "en"
    depth = len(parts) - 1
    local = "/".join(parts[1:]) if lang == "ar" else rel
    if local == "index.html":
        key = "home"
    elif local.endswith("/index.html"):
        key = local[: -len("index.html")]
    else:
        key = local[: -len(".html")]
    return rel, lang, depth, key


def key_url(key):
    return "" if key == "home" else key


def alt_url(path, lang, depth, key):
    root = "../" * depth
    other_home = root + "ar/" if lang == "en" else root
    parts = path.relative_to(ROOT).parts
    counterpart = ROOT.joinpath("ar", *parts) if lang == "en" else ROOT.joinpath(*parts[1:])
    if key in MIRRORED_KEYS or counterpart.exists():
        url = other_home + key_url(key)
    else:
        url = other_home
    return url or "./"


def mark_current(html, key):
    def add(match):
        tag, nav = match.group(0), match.group(1)
        if "aria-current" in tag:
            return tag
        if nav == key:
            return tag[:-1] + ' aria-current="page">'
        if nav == "services" and key in SERVICE_KEYS:
            return tag[:-1] + ' aria-current="true">'
        return tag
    return NAV_LINK_RE.sub(add, html)


def render(partial, root, home, alt, key):
    html = partial.replace("{{root}}", root).replace("{{home}}", home).replace("{{alt}}", alt)
    html = html.replace('href=""', 'href="./"')
    return mark_current(html, key)


def load_partials():
    partials = {}
    for name in BLOCKS:
        for lang in ("en", "ar"):
            file = PARTIALS / ("%s.%s.html" % (name, lang))
            if not file.exists():
                sys.exit("sync_chrome: missing partial %s" % file.relative_to(ROOT))
            partials[name, lang] = file.read_text(encoding="utf-8").strip("\n")
    return partials


def iter_pages(args):
    if args:
        for arg in args:
            yield Path(arg).resolve()
        return
    for path in sorted(ROOT.rglob("*.html")):
        if not SKIP_DIRS.intersection(path.relative_to(ROOT).parts[:-1]):
            yield path


def sync_page(path, partials, check):
    text = path.read_text(encoding="utf-8")
    present = [name for name in BLOCKS if "<!-- chrome:%s -->" % name in text]
    if not present:
        return None
    rel, lang, depth, key = page_info(path)
    root = "../" * depth
    home = root + ("ar/" if lang == "ar" else "")
    alt = alt_url(path, lang, depth, key)
    problems = []
    html_lang = re.search(r'<html[^>]*\blang="([^"]+)"', text)
    if html_lang and html_lang.group(1).split("-")[0] != lang and rel != "404.html":
        problems.append('html lang="%s" but path says %s' % (html_lang.group(1), lang))
    new = text
    for name in present:
        if text.count("<!-- chrome:%s -->" % name) != 1 or text.count("<!-- /chrome:%s -->" % name) != 1:
            raise SystemExit("sync_chrome: %s needs exactly one <!-- chrome:%s --> ... <!-- /chrome:%s --> pair" % (rel, name, name))
        block = "\n" + render(partials[name, lang], root, home, alt, key) + "\n"
        new = BLOCK_RE[name].sub(lambda m: m.group(1) + block + m.group(3), new, count=1)
    missing = [name for name in BLOCKS if name not in present]
    if missing:
        problems.append("no marker for " + ",".join(missing))
    changed = new != text
    if changed and not check:
        path.write_text(new, encoding="utf-8")
    state = ("OUT OF SYNC" if check else "updated") if changed else "unchanged"
    note = ("  ! " + "; ".join(problems)) if problems else ""
    print("%-46s %s depth=%d key=%-24s alt=%-28s [%s] %s%s" % (rel, lang, depth, key, alt, " ".join(present), state, note))
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="report out-of-sync pages without writing; exit 1 if any")
    parser.add_argument("files", nargs="*", help="pages to sync (default: every .html outside scripts/)")
    args = parser.parse_args()
    partials = load_partials()
    results = [sync_page(path, partials, args.check) for path in iter_pages(args.files)]
    synced = [r for r in results if r is not None]
    changed = sum(1 for r in synced if r)
    print("sync_chrome: %d page(s) with chrome, %d %s" % (len(synced), changed, "out of sync" if args.check else "updated"))
    if args.check and changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
