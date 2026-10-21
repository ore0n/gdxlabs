"""Remove the VideoPro theme's demo taxonomies and demo post from the static snapshot.

Usage: python3 -I tools/remove_demo_content.py <site_dir>
"""
import os, re, sys, shutil

ROOT = os.path.abspath(sys.argv[1])
DEMO_CATEGORIES = ["aww", "fail", "lol", "movie-tv", "nsfw", "wow", "wtf"]
DEMO_TAGS = ["computer", "movie", "technology"]
DEMO_POSTS = ["2016/09/telstra-unveils"]

cat_re = "|".join(map(re.escape, DEMO_CATEGORIES))
tag_re = "|".join(map(re.escape, DEMO_TAGS))
post_re = "|".join(re.escape(p.split("/")[-1]) for p in DEMO_POSTS)
DEMO_HREF = re.compile(r'href="[^"]*(?:category/(?:%s)|tag/(?:%s)|%s)/index\.html"' % (cat_re, tag_re, post_re))
CATEGORY_LINK = re.compile(r'<a class="font-size-1" href="([^"]*)category/([\w-]+)/index\.html" title="View all posts in [^"]*">[^<]*</a>')
BREADCRUMB = re.compile(r'(<i class="fas fa-angle-right" aria-hidden="true"></i>)?<span typeof="v:Breadcrumb"><a rel="v:url" property="v:title" href="([^"]*)category/([\w-]+)/index\.html">[^<]*</a></span>')
ARTICLE = re.compile(r'<article class="cactus-post-item[^"]*">(?:(?!<article\b).)*?</article>', re.S)
LINK_REL = re.compile(r"<link rel='(?:prev|next)'[^>]*>\s*")


def remove_div(s, start_tag):
    """Remove every <div ...> starting with start_tag, including nested divs."""
    while (i := s.find(start_tag)) != -1:
        depth, j = 0, i
        for m in re.finditer(r'<div\b|</div>', s[i:]):
            depth += 1 if m.group(0) != "</div>" else -1
            if depth == 0:
                j = i + m.end()
                break
        s = s[:i] + s[j:]
    return s


def clean(s):
    # breadcrumb: point at the first real category of the post, or drop the crumb
    real = [c for _, c in CATEGORY_LINK.findall(s) if c not in DEMO_CATEGORIES]

    def crumb(m):
        if m.group(3) not in DEMO_CATEGORIES:
            return m.group(0)
        if not real:
            return ""
        return m.group(0).replace("category/%s/" % m.group(3), "category/%s/" % real[0]).replace(
            re.search(r'>([^<]*)</a></span>', m.group(0)).group(1), real[0].upper())
    s = BREADCRUMB.sub(crumb, s)
    s = CATEGORY_LINK.sub(lambda m: "" if m.group(2) in DEMO_CATEGORIES else m.group(0), s)
    s = re.sub(r'<a href="[^"]*tag/(?:%s)/index\.html" class="font-size-1">[^<]*</a>' % tag_re, "", s)
    # cards and prev/next navigation pointing at demo posts
    s = ARTICLE.sub(lambda m: "" if DEMO_HREF.search(m.group(0)) else m.group(0), s)
    s = LINK_REL.sub(lambda m: "" if DEMO_HREF.search(m.group(0).replace("'", '"')) else m.group(0), s)
    for cls in ("prev-post", "next-post"):
        tag = '<div class="%s">' % cls
        i = s.find(tag)
        if i != -1 and DEMO_HREF.search(s[i:i + 400]):
            s = remove_div(s, tag)
    return s


for path in ["category/" + c for c in DEMO_CATEGORIES] + ["tag/" + t for t in DEMO_TAGS] + DEMO_POSTS:
    shutil.rmtree(os.path.join(ROOT, path), ignore_errors=True)

for d, _, fs in os.walk(ROOT):
    for f in fs:
        if f.endswith(".html"):
            p = os.path.join(d, f)
            s = open(p, encoding="utf-8").read()
            new = clean(s)
            if new != s:
                open(p, "w", encoding="utf-8").write(new)
                print("cleaned", os.path.relpath(p, ROOT))

leftover = []
for d, _, fs in os.walk(ROOT):
    for f in fs:
        if f.endswith(".html") and DEMO_HREF.search(open(os.path.join(d, f), encoding="utf-8").read()):
            leftover.append(os.path.relpath(os.path.join(d, f), ROOT))
print("leftover demo links:", leftover or "none")
