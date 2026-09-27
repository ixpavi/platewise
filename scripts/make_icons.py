"""Draws the app icon, Android adaptive icon layers, splash image and favicon from the Platewise logo
(the same shapes as src/components/Logo.tsx: viewfinder corners, a ring and a citrus dot).

    python -m pip install pillow
    python scripts/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
GREEN = (31, 77, 54, 255)  # splash background, #1F4D36
WHITE = (255, 255, 255, 255)
CITRUS = (245, 194, 62, 255)  # #F5C23E
SS = 4  # draw 4x larger, then scale down for smooth edges


def logo(size: int, ring=WHITE, dot=CITRUS) -> Image.Image:
    """The logo on a transparent square of `size` pixels (the 40-unit viewBox of Logo.tsx)."""
    big = size * SS
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = big / 40
    w = round(3 * u)
    P = lambda x, y: (x * u, y * u)

    def cap(x, y):
        r = 1.5 * u
        d.ellipse([x * u - r, y * u - r, x * u + r, y * u + r], fill=ring)

    def arc(cx, cy, start, end):
        r = 3 * u + w / 2
        d.arc([cx * u - r, cy * u - r, cx * u + r, cy * u + r], start, end, fill=ring, width=w)

    # Four rounded corners: (segment, arc, segment), with round ends.
    for (a, b), (cx, cy, s, e), (c, f) in [
        (((4, 12), (4, 7)), (7, 7, 180, 270), ((7, 4), (12, 4))),
        (((28, 4), (33, 4)), (33, 7, 270, 360), ((36, 7), (36, 12))),
        (((36, 28), (36, 33)), (33, 33, 0, 90), ((33, 36), (28, 36))),
        (((12, 36), (7, 36)), (7, 33, 90, 180), ((4, 33), (4, 28))),
    ]:
        d.line([P(*a), P(*b)], fill=ring, width=w)
        d.line([P(*c), P(*f)], fill=ring, width=w)
        arc(cx, cy, s, e)
        cap(*a)
        cap(*f)
    # Ring (radius 10, stroke 3) and dot (radius 4.5).
    r = 11.5 * u
    d.ellipse([20 * u - r, 20 * u - r, 20 * u + r, 20 * u + r], outline=ring, width=w)
    r = 4.5 * u
    d.ellipse([20 * u - r, 20 * u - r, 20 * u + r, 20 * u + r], fill=dot)
    return img.resize((size, size), Image.LANCZOS)


def on(canvas: int, mark: int, bg=(0, 0, 0, 0), **kw) -> Image.Image:
    img = Image.new('RGBA', (canvas, canvas), bg)
    m = logo(mark, **kw)
    img.alpha_composite(m, ((canvas - mark) // 2, (canvas - mark) // 2))
    return img


# App icon (iOS and older Android): the logo on green, no transparency.
on(1024, 600, GREEN).convert('RGB').save(ASSETS / 'icon.png')
# Android adaptive icon: the logo inside the safe circle, on a plain green layer.
on(512, 270).save(ASSETS / 'android-icon-foreground.png')
Image.new('RGBA', (512, 512), GREEN).save(ASSETS / 'android-icon-background.png')
on(512, 270, dot=WHITE).save(ASSETS / 'android-icon-monochrome.png')
# Splash image (the green background comes from app.json).
logo(512).save(ASSETS / 'splash-icon.png')
# Browser tab icon.
on(1024, 760, GREEN).resize((48, 48), Image.LANCZOS).save(ASSETS / 'favicon.png')
print('wrote icons to', ASSETS)
