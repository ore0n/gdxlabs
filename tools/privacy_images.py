"""Blur faces in the site's photos and take the team group photo out.

WordPress stores every upload as an original plus resized copies named
<name>-<W>x<H>.<ext>. Faces are blurred on the original and every copy is
regenerated from it the way WordPress does (scale to cover, centre crop).

Usage: python3 -I tools/privacy_images.py <site_dir>
"""
import glob, os, re, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(sys.argv[1])
UPLOADS = os.path.join(ROOT, "wp-content/uploads")

# face boxes relative to the original image: (x, y, width, height)
FACES = {
    "2016/09/Foto-03.08-1.jpg": [(0.27, 0.27, 0.46, 0.50)],
    "2016/09/IMG_4889-2.jpg": [(0.36, 0.28, 0.38, 0.45)],
    "2016/09/admin-ajax.jpg": [(0.34, 0.10, 0.30, 0.42)],
    "2018/03/IMG_4919-darken.jpg": [(0.34, 0.15, 0.23, 0.17)],
    "2014/12/screen-barcelona-1.jpg": [(0.47, 0.17, 0.06, 0.09), (0.92, 0.12, 0.06, 0.10)],
    "2015/03/screen-croatia-3.jpg": [(0.495, 0.28, 0.07, 0.11), (0.75, 0.59, 0.08, 0.10)],
}
GROUP_PHOTOS = [
    "2018/03/65EC33AF-62EA-43D6-8F1A-7894C2A2AC91-e1528374656436",
    "2018/03/498E1750-46D5-4DCA-838E-574D29A35BE1",
]
GROUP_PHOTO_PLACEHOLDER_LOGO = "2016/09/Logo-gdx2-inv.png"


def variants(original):
    stem, ext = os.path.splitext(original)
    pattern = re.compile(re.escape(os.path.basename(stem)) + r"-(\d+)x(\d+)" + re.escape(ext) + "$")
    for f in glob.glob(glob.escape(stem) + "-*" + ext):
        m = pattern.match(os.path.basename(f))
        if m:
            yield f, int(m.group(1)), int(m.group(2))


def resize_like_wordpress(im, w, h):
    """Exact resize when the aspect ratio matches, otherwise cover + centre crop."""
    if abs(im.width / im.height - w / h) < 0.02:
        return im.resize((w, h), Image.LANCZOS)
    scale = max(w / im.width, h / im.height)
    sw, sh = round(im.width * scale), round(im.height * scale)
    im = im.resize((sw, sh), Image.LANCZOS)
    left, top = (sw - w) // 2, (sh - h) // 2
    return im.crop((left, top, left + w, top + h))


def save(im, path, mode):
    if path.lower().endswith((".jpg", ".jpeg")):
        im.convert("RGB").save(path, quality=88)
    else:
        im.convert(mode).save(path)


def blur_faces(path, boxes):
    im = Image.open(path)
    mode = im.mode
    im = im.convert("RGB")
    for x, y, w, h in boxes:
        box = (int(x * im.width), int(y * im.height), int((x + w) * im.width), int((y + h) * im.height))
        radius = max(6, (box[2] - box[0]) // 6)
        # pixelate first so the blur cannot be reversed, then soften the edges
        region = im.crop(box)
        small = region.resize((max(1, region.width // 12), max(1, region.height // 12)), Image.BILINEAR)
        region = small.resize(region.size, Image.NEAREST).filter(ImageFilter.GaussianBlur(radius / 2))
        mask = Image.new("L", region.size, 0)
        ImageDraw.Draw(mask).ellipse((0, 0, region.width - 1, region.height - 1), fill=255)
        im.paste(region, box[:2], mask.filter(ImageFilter.GaussianBlur(radius / 3)))
    save(im, path, mode)
    for f, w, h in variants(path):
        save(resize_like_wordpress(im, w, h), f, mode)


def replace_group_photo(stem):
    logo = Image.open(os.path.join(UPLOADS, GROUP_PHOTO_PLACEHOLDER_LOGO)).convert("RGBA")
    original = glob.glob(stem + ".jp*g")[0]
    for f in [original] + [v[0] for v in variants(original)]:
        w, h = Image.open(f).size
        canvas = Image.new("RGB", (w, h), (12, 14, 30))
        mark = logo.copy()
        mark.thumbnail((int(w * 0.45), int(h * 0.6)), Image.LANCZOS)
        canvas.paste(mark, ((w - mark.width) // 2, (h - mark.height) // 2), mark)
        canvas.save(f, quality=88)


for rel, boxes in FACES.items():
    blur_faces(os.path.join(UPLOADS, rel), boxes)
    print("blurred", rel)
for stem in GROUP_PHOTOS:
    replace_group_photo(os.path.join(UPLOADS, stem))
    print("replaced", stem)
