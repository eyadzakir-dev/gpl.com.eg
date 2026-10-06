"""Static server for local preview that behaves like GitHub Pages: clean URLs (/about -> about.html) and 404.html for
missing paths (with status 404).

Usage: python3 scripts/serve.py <root> <port>
"""
import http.server
import io
import os
import sys

ROOT = sys.argv[1]
PORT = int(sys.argv[2])
NOT_FOUND_PAGE = os.path.join(ROOT, "404.html")


class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        resolved = super().translate_path(path)
        if not os.path.exists(resolved) and os.path.exists(resolved + ".html"):
            return resolved + ".html"
        return resolved

    def send_head(self):
        if os.path.exists(self.translate_path(self.path)) or not os.path.isfile(NOT_FOUND_PAGE):
            return super().send_head()
        with open(NOT_FOUND_PAGE, "rb") as page:
            body = page.read()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return io.BytesIO(body)


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), CleanURLHandler).serve_forever()
