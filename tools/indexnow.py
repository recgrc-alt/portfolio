# -*- coding: utf-8 -*-
"""
Tells Bing (and the other engines on the IndexNow protocol) that pages have
changed, instead of waiting for them to come and look.

HOW IT WORKS
    A key sits in a text file at the site root, named after itself. Submitting
    URLs means naming that key; the engine fetches the file to check that
    whoever is submitting controls the site. Only URLs on this domain are
    accepted, so nobody can use it to submit someone else's pages.

RUN IT
    python tools/indexnow.py            # every URL in sitemap.xml
    python tools/indexnow.py <url> ...  # only the ones given

Run it AFTER the deploy is live: the engines read the pages immediately, and
submitting one that is not there yet wastes the visit.
"""
import io, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "rogerioedgar.com"
KEY_FILE = os.path.join(ROOT, "indexnow-key.txt")
ENDPOINT = "https://api.indexnow.org/indexnow"


def key():
    """The key lives in one file, and the site serves a copy named after it."""
    with io.open(KEY_FILE, encoding="utf-8") as fh:
        return fh.read().strip()


def urls_from_sitemap():
    s = io.open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    return re.findall(r"<loc>([^<]+)</loc>", s)


def submit(urls):
    k = key()
    payload = json.dumps({
        "host": HOST,
        "key": k,
        "keyLocation": f"https://{HOST}/{k}.txt",
        "urlList": urls,
    }).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=payload,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode("utf-8", "ignore")


if __name__ == "__main__":
    targets = sys.argv[1:] or urls_from_sitemap()
    bad = [u for u in targets if not u.startswith(f"https://{HOST}/")]
    if bad:
        sys.exit(f"URLs fora do dominio, recusados: {bad}")
    status, body = submit(targets)
    print(f"{len(targets)} URLs submetidos  ->  HTTP {status} {body.strip() or '(sem corpo)'}")
    print("200 ou 202 significa aceite.")
