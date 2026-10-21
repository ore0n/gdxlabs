"""Turn the wget mirror of test.exagine.com into a self-contained static site.

Usage: python3 -I staticize.py <mirror_dir>
"""
import os, re, sys, subprocess, posixpath
from urllib.parse import unquote

ROOT = os.path.abspath(sys.argv[1])
HOST = "test.exagine.com"
CA = "/root/.ccr/ca-bundle.crt"
OLD_DOMAIN_ANCHOR = re.compile(r'https?://(?:www\.)?gdxlabs\.com/?(#[\w-]+)')
ABS = re.compile(r'https?://(?:' + re.escape(HOST) + r'|(?:www\.)?gdxlabs\.com)(/[^"\'\s<>()]*)?')
TEXT_EXT = (".html", ".css", ".js")


def rel(from_file, target):
    """Relative link from from_file (abs path) to target (site path, '/'-rooted)."""
    start = posixpath.dirname("/" + os.path.relpath(from_file, ROOT))
    r = posixpath.relpath(target, start)
    return r


def text_files():
    for d, _, fs in os.walk(ROOT):
        for f in fs:
            if f.endswith(TEXT_EXT) and "?" not in f:
                yield os.path.join(d, f)


# 1. drop query-string page variants (sort orders, ?p= shortlinks, ?view=)
shortlinks = {}
for d, _, fs in os.walk(ROOT):
    for f in fs:
        if "?" in f and f.endswith(".html"):
            p = os.path.join(d, f)
            m = re.match(r"index\.html\?p=(\d+)\.html$", f)
            if m and d == ROOT:
                og = re.search(r'og:url" content="https://' + re.escape(HOST) + r'(/[^"]*)"',
                               open(p, encoding="utf-8", errors="replace").read())
                if og:
                    shortlinks[m.group(1)] = og.group(1)
                else:  # pages have no og:url, ask WordPress where the shortlink redirects
                    loc = subprocess.run(["curl", "-s", "--cacert", CA, "-o", "/dev/null", "-w", "%{redirect_url}",
                                          f"https://{HOST}/?p={m.group(1)}"], capture_output=True, text=True).stdout
                    if loc.startswith(f"https://{HOST}/"):
                        shortlinks[m.group(1)] = loc[len(f"https://{HOST}"):]
            os.remove(p)

# 2. download assets that are only referenced absolutely (lazy-load attrs, srcset, inline css)
wanted = set()
for p in text_files():
    for m in ABS.finditer(open(p, encoding="utf-8", errors="replace").read()):
        path = (m.group(1) or "/").split("?")[0].split("#")[0]
        if path.startswith(("/wp-content/", "/wp-includes/")) and not path.endswith(".php"):
            if not os.path.exists(os.path.join(ROOT, path.lstrip("/"))):
                wanted.add(path)
for path in sorted(wanted):
    dest = os.path.join(ROOT, path.lstrip("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    r = subprocess.run(["curl", "-sSf", "--cacert", CA, "-o", dest, f"https://{HOST}{path}"])
    if r.returncode:
        print("missing upstream:", path)

# 3. strip ?query from asset filenames (fonts etc.)
for d, _, fs in os.walk(ROOT):
    for f in fs:
        if "?" in f:
            src, dst = os.path.join(d, f), os.path.join(d, f.split("?")[0])
            if os.path.exists(dst):
                os.remove(src)
            else:
                os.rename(src, dst)

HEAD_JUNK = re.compile(
    r'<link[^>]*(?:xmlrpc\.php|wlwmanifest|/feed/|wp-json|rel=["\']shortlink|rel=["\']EditURI|rel=["\']alternate["\'][^>]*oembed)[^>]*/?>\s*')


def fix(p):
    s = orig = open(p, encoding="utf-8", errors="replace").read()
    is_html = p.endswith(".html")
    if is_html:
        s = HEAD_JUNK.sub("", s)
        s = re.sub(r'<link rel=["\']https://api\.w\.org/["\'][^>]*>\s*', "", s)
        # view-counter pixels pointing at the post itself
        s = re.sub(r'<img src="(?:\.\./)*index\.html%3Fp=\d+\.html"\s*/?>', "", s)
        # shortlinks -> permalinks
        s = re.sub(r'(?:\.\./)*index\.html%3Fp=(\d+)\.html',
                   lambda m: rel(p, shortlinks[m.group(1)] + "index.html") if m.group(1) in shortlinks else rel(p, "/index.html"), s)
        # sort/view variants -> plain listing page
        s = re.sub(r'href="([^"]*?)(?:/index\.html)?%3F[^"#]*?\.html"',
                   lambda m: 'href="%s/index.html"' % m.group(1) if m.group(1) not in ("", "index.html") else 'href="index.html"', s)
        # old-domain menu anchors -> home page anchors
        s = OLD_DOMAIN_ANCHOR.sub(lambda m: rel(p, "/index.html") + m.group(1), s)
        s = re.sub(r'href="https?://' + re.escape(HOST) + r'/wp-login\.php[^"]*"', 'href="#"', s)
    # asset refs with cache-busting query (wget writes ? as %3F)
    s = re.sub(r'(\.(?:eot|svg|ttf|woff2?|otf|css|js|png|jpe?g|gif))(?:%3F|\?)(?:ver=)?[\w.\-=&;]*', r'\1', s)
    # absolute site URLs -> relative
    def absrepl(m):
        path = m.group(1) or "/"
        if re.search(r'\.php|wp-json|/feed/', path) or not path.startswith("/wp-") and "gdxlabs" in m.group(0):
            return m.group(0)
        frag = ""
        if "#" in path:
            path, frag = path.split("#", 1)
            frag = "#" + frag
        path = path.split("?")[0]
        local = path.lstrip("/")
        if path.endswith("/") or not posixpath.splitext(path)[1]:
            local = posixpath.join(local, "index.html")
        if not os.path.exists(os.path.join(ROOT, local)):
            return m.group(0)
        if p.endswith(".js"):  # JS paths resolve against the page, not the script
            return "/" + local + frag
        return rel(p, "/" + local) + frag
    s = ABS.sub(absrepl, s)
    if s != orig:
        open(p, "w", encoding="utf-8").write(s)


for p in text_files():
    fix(p)

os.remove(os.path.join(ROOT, "wp-includes/wlwmanifest.xml")) if os.path.exists(os.path.join(ROOT, "wp-includes/wlwmanifest.xml")) else None
print("shortlinks:", shortlinks)
print("downloaded:", len(wanted))
