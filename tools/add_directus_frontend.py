"""Hook js/gdx-directus.js into the static pages.

Adds the scripts to every page with the newsletter form (Contact Form 7 #482)
and turns the empty WordPress "Blog" page into the Directus news feed.

Usage: python3 -I tools/add_directus_frontend.py <site_dir>
"""
import os, posixpath, sys

ROOT = os.path.abspath(sys.argv[1])
MARKER = "js/gdx-directus.js"


def rel(page, target):
    return posixpath.relpath(target, posixpath.dirname(os.path.relpath(page, ROOT).replace(os.sep, "/")))


for d, _, fs in os.walk(ROOT):
    for f in fs:
        if not f.endswith(".html"):
            continue
        page = os.path.join(d, f)
        s = open(page, encoding="utf-8").read()
        is_blog = os.path.relpath(page, ROOT) == os.path.join("blog", "index.html")
        if MARKER in s or not ("wpcf7-f482" in s or is_blog):
            continue
        scripts = (f'<script src="{rel(page, "js/gdx-directus-config.js")}"></script>\n'
                   f'<script src="{rel(page, MARKER)}"></script>\n')
        s = s.replace("</body>", scripts + "</body>", 1)
        if is_blog:
            s = s.replace("</head>", f"<link rel='stylesheet' href='{rel(page, 'gdx-directus.css')}' type='text/css' media='all' />\n</head>", 1)
            s = s.replace('<span class="current">Blog</span>', '<span class="current">News</span>', 1)
            s = s.replace('<h1 class="single-title entry-title">Blog</h1>', '<h1 class="single-title entry-title">News</h1>', 1)
            s = s.replace("<title>Blog &#8211;", "<title>News &#8211;", 1)
            s = s.replace('<div class="body-content">\n            <!--Content-->',
                          '<div class="body-content">\n            <!--Content-->\n            <div id="gdx-news"></div>', 1)
            assert 'id="gdx-news"' in s, "blog page layout changed, news container not inserted"
        open(page, "w", encoding="utf-8").write(s)
        print("updated", os.path.relpath(page, ROOT))
