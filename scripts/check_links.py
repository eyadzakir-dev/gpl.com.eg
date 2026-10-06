#!/usr/bin/env python3
"""Check every internal link, asset and #fragment in the site the way GitHub Pages resolves them (stdlib only).

Resolution rules: "x/" -> x/index.html; "x" -> the file x, else x/index.html (Pages redirects to "x/"), else x.html.
Matching is case-sensitive, like GitHub Pages. External http(s):, mailto:, tel:, data:, javascript: and
protocol-relative URLs are ignored. Root-absolute paths ("/x") are reported, because pages must use relative links.

Usage:
    python3 scripts/check_links.py            # check the whole repo (every .html outside scripts/)
    python3 scripts/check_links.py FILE ...   # check some pages only
Exits 1 and lists every broken reference when anything is broken.
"""
import os
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", "scripts", "node_modules", ".playwright-mcp", ".github", ".vscode"}
URL_ATTRS = {"href", "src", "poster", "action", "xlink:href"}
SRCSET_ATTRS = {"srcset", "imagesrcset"}
IGNORED_SCHEMES = {"http", "https", "mailto", "tel", "data", "javascript", "sms", "ftp"}
PARSEABLE = {".html", ".svg"}


class RefParser(HTMLParser):
    """Collects element ids/names and every URL-bearing attribute with its line number."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if value is None:
                continue
            if name == "id" or (name == "name" and tag == "a"):
                self.ids.add(value)
            elif name in URL_ATTRS:
                self.refs.append((self.getpos()[0], name, value.strip()))
            elif name in SRCSET_ATTRS:
                for candidate in value.split(","):
                    url = candidate.strip().split(" ")[0]
                    if url:
                        self.refs.append((self.getpos()[0], name, url))

    handle_startendtag = handle_starttag


_parsed = {}


def parse(path):
    if path not in _parsed:
        parser = RefParser()
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
        _parsed[path] = parser
    return _parsed[path]


def exists_exact(path):
    """True if path exists with exactly this letter case (macOS is case-insensitive, GitHub Pages is not)."""
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        return False
    current = ROOT
    for part in rel.parts:
        try:
            if part not in os.listdir(current):
                return False
        except (NotADirectoryError, FileNotFoundError):
            return False
        current = current / part
    return True


def resolve(page, url_path):
    """Map a relative URL path to the file GitHub Pages would serve, or None."""
    target = Path(os.path.normpath(page.parent / url_path))
    if url_path.endswith("/") or url_path in ("", ".", ".."):
        candidates = [target / "index.html"] if url_path else [page]
    else:
        candidates = [target, target / "index.html", target.with_name(target.name + ".html")]
    for candidate in candidates:
        if candidate.is_file() and exists_exact(candidate):
            return candidate
    return None


def check_ref(page, value):
    """Return an error string for a broken reference, or None."""
    if not value or value.startswith(("{{", "//")):
        return None
    parts = urlsplit(value)
    if parts.scheme:
        return None if parts.scheme.lower() in IGNORED_SCHEMES else "unsupported scheme"
    if parts.path.startswith("/"):
        return "root-absolute path (use a relative link)"
    url_path = unquote(parts.path)
    target = resolve(page, url_path) if url_path else page
    if target is None:
        return "missing target"
    fragment = unquote(parts.fragment)
    if fragment and target.suffix in PARSEABLE and fragment not in parse(target).ids:
        return "missing #%s in %s" % (fragment, target.relative_to(ROOT).as_posix())
    return None


def iter_pages(args):
    if args:
        for arg in args:
            yield Path(arg).resolve()
        return
    for path in sorted(ROOT.rglob("*.html")):
        if not SKIP_DIRS.intersection(path.relative_to(ROOT).parts[:-1]):
            yield path


def main():
    pages = list(iter_pages(sys.argv[1:]))
    broken = []
    total = 0
    for page in pages:
        for line, attr, value in parse(page).refs:
            total += 1
            error = check_ref(page, value)
            if error:
                broken.append("%s:%d  %s=\"%s\"  %s" % (page.relative_to(ROOT).as_posix(), line, attr, value, error))
    for item in broken:
        print(item)
    print("check_links: %d page(s), %d reference(s), %d broken" % (len(pages), total, len(broken)))
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
