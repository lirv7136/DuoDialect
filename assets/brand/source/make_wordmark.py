"""Builds the Talkeven wordmark and lockups as outlined SVGs, PNG exports and a proof sheet.

The wordmark is "talk", a rounded divider bar, then "even", set in Fraunces SemiBold (wght 600,
opsz 24, SOFT 0, WONK 0) and converted to outlines, so the SVGs need no font. The divider keeps
the icon's bar proportions (1:5, fully rounded ends), is centred on the x-height and dips below
the baseline so it never reads as a letter l.

Needs: Fraunces[SOFT,WONK,opsz,wght].ttf (SIL OFL 1.1, from github.com/google/fonts/tree/main/ofl/fraunces)
next to this script or passed as FRAUNCES=/path, Plus Jakarta Sans for proof labels (optional),
Python packages uharfbuzz, fonttools and pillow, and Inkscape for the PNG exports.

    python3 assets/brand/source/make_wordmark.py
"""
import os
import subprocess
import tempfile
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = Path(__file__).resolve().parent
BRAND = HERE.parent
SITE = BRAND.parent.parent / "site"
FONT = os.environ.get("FRAUNCES", str(HERE / "Fraunces[SOFT,WONK,opsz,wght].ttf"))
LABEL_FONT = os.environ.get("JAKARTA", str(HERE / "PlusJakartaSans[wght].ttf"))

INK = "#0f2f3d"
CREAM = "#f5f3ec"
AQUA = "#16a39f"
PRIMARY = "#0f3d47"
BG = "#f3f5f0"

# Wordmark settings, in ems of the type size
OPSZ = 24
BAR_H = 0.66        # divider height
BAR_RATIO = 5.0     # height / width, as the icon's 76 x 380 bar
BAR_BOTTOM = -0.085  # divider bottom relative to the baseline (negative = below), centres it on the x-height
GAP_L = 0.07        # ink of k to divider (k's open diagonals already add white)
GAP_R = 0.08        # divider to ink of e
EM = 100.0          # output units per em; 1 unit = 1 px at 1x

_face = hb.Face(hb.Blob.from_file_path(FONT))


def _font():
    f = hb.Font(_face)
    f.set_variations({"wght": 600, "opsz": OPSZ, "SOFT": 0, "WONK": 0})
    return f


def _shape(font, text):
    b = hb.Buffer()
    b.add_str(text)
    b.guess_segment_properties()
    hb.shape(font, b, {"kern": True, "liga": True})
    return list(zip(b.glyph_infos, b.glyph_positions))


def _num(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def _outline(font, text, x, s, baseline):
    """Outline `text` with its pen starting at x (font units). Returns path d and ink x max (font units)."""
    pen = SVGPathPen(None, ntos=_num)
    xmax = None
    for info, pos in _shape(font, text):
        font.draw_glyph_with_pen(info.codepoint, TransformPen(
            pen, (s, 0, 0, -s, (x + pos.x_offset) * s, baseline - pos.y_offset * s)))
        e = font.get_glyph_extents(info.codepoint)
        gx1 = x + pos.x_offset + e.x_bearing + e.width
        xmax = gx1 if xmax is None else max(xmax, gx1)
        x += pos.x_advance
    return pen.getCommands(), xmax


def _ink_left(font, text):
    info, pos = _shape(font, text)[0]
    return pos.x_offset + font.get_glyph_extents(info.codepoint).x_bearing


def _top(font, ch):
    info, _ = _shape(font, ch)[0]
    return font.get_glyph_extents(info.codepoint).y_bearing


class Wordmark:
    def __init__(self, left="talk", right="even"):
        font = _font()
        s = EM / 2000.0
        asc = max(_top(font, c) for c in left + right) * s
        self.baseline = asc
        bh = BAR_H * EM
        bw = bh / BAR_RATIO
        bar_y1 = asc - BAR_BOTTOM * EM
        self.d_left, lx1 = _outline(font, left, -_ink_left(font, left), s, asc)
        bar_x = lx1 * s + GAP_L * EM
        rstart = (bar_x + bw + GAP_R * EM) / s - _ink_left(font, right)
        self.d_right, rx1 = _outline(font, right, rstart, s, asc)
        self.bar = (bar_x, bar_y1 - bh, bw, bh)
        self.width = rx1 * s
        self.height = max(asc + 0.02 * EM, bar_y1)  # e/n overshoot or the divider, whichever is lower

    def group(self, text, bar, x=0.0, y=0.0, text_cls="", bar_cls=""):
        bx, by, bw, bh = self.bar
        tc = f' class="{text_cls}"' if text_cls else ""
        bc = f' class="{bar_cls}"' if bar_cls else ""
        return (f'<g transform="translate({_num(x)} {_num(y)})">'
                f'<path{tc} fill="{text}" d="{self.d_left}{self.d_right}"/>'
                f'<rect{bc} fill="{bar}" x="{_num(bx)}" y="{_num(by)}" width="{_num(bw)}" height="{_num(bh)}" rx="{_num(bw / 2)}"/></g>')


def icon(size, x=0.0, y=0.0, tile=AQUA, bar=INK):
    """The split disc app icon on a rounded tile (22.5% corner radius, as the site header uses)."""
    k = size / 1024.0
    return (f'<g transform="translate({_num(x)} {_num(y)}) scale({k:.5f})">'
            f'<rect width="1024" height="1024" rx="230" fill="{tile}"/>'
            f'<path d="M402 215.8A316 316 0 0 0 402 808.2Z" fill="{INK}"/>'
            f'<path d="M622 215.8A316 316 0 0 1 622 808.2Z" fill="{CREAM}"/>'
            f'<rect x="474" y="322" width="76" height="380" rx="38" fill="{bar}"/></g>')


def svg(w, h, body, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_num(w)} {_num(h)}" width="{_num(w)}" '
            f'height="{_num(h)}" role="img" aria-label="Talkeven"{extra}><title>Talkeven</title>{body}</svg>\n')


def wordmark_svg(wm, text=INK, bar=AQUA):
    return svg(wm.width, wm.height, wm.group(text, bar))


ICON_H = 1.0   # horizontal lockup: icon height in ems
GAP_H = 0.28   # icon to wordmark
ICON_S = 1.6   # stacked lockup: icon size in ems
GAP_S = 0.32   # icon to wordmark


def horizontal(wm, text=INK, bar=AQUA, text_cls="", bar_cls="", extra=""):
    S = ICON_H * EM
    cy = wm.baseline / 2  # centre of baseline..ascender
    iy = cy - S / 2
    top = min(iy, 0)
    h = max(iy + S, wm.height) - top
    body = icon(S, 0, iy - top) + wm.group(text, bar, S + GAP_H * EM, -top, text_cls, bar_cls)
    return svg(S + GAP_H * EM + wm.width, h, body, extra)


def stacked(wm, text=INK, bar=AQUA):
    S = ICON_S * EM
    bx, _, bw, _ = wm.bar
    ix = bx + bw / 2 - S / 2  # the icon's divider sits directly over the wordmark's divider
    left = min(0, ix)
    w = max(wm.width, ix + S) - left
    body = icon(S, ix - left, 0) + wm.group(text, bar, -left, S + GAP_S * EM)
    return svg(w, S + GAP_S * EM + wm.height, body)


def png(svg_path, out, height):
    subprocess.run(["inkscape", "--export-type=png", f"--export-filename={out}", f"--export-height={height}",
                    str(svg_path)], check=True, capture_output=True)


def main():
    wm = Wordmark()
    files = {
        "wordmark": wordmark_svg(wm),
        "wordmark-reverse": wordmark_svg(wm, CREAM, AQUA),
        "lockup-horizontal": horizontal(wm),
        "lockup-horizontal-reverse": horizontal(wm, CREAM, AQUA),
        "lockup-stacked": stacked(wm),
        "lockup-stacked-reverse": stacked(wm, CREAM, AQUA),
        # on the aqua tile colour: ink type with a cream divider, so the divider doesn't vanish
        "wordmark-on-aqua": wordmark_svg(wm, INK, CREAM),
        "lockup-horizontal-on-aqua": horizontal(wm, INK, CREAM),
        "lockup-stacked-on-aqua": stacked(wm, INK, CREAM),
    }
    heights = {}
    for name, text in files.items():
        p = BRAND / f"{name}.svg"
        p.write_text(text)
        h = float(text.split('height="')[1].split('"')[0])
        heights[name] = h
        for k in (2, 3):
            png(p, BRAND / f"{name}@{k}x.png", round(h * k))
    # Site header: horizontal lockup themed by CSS classes (fills are the light theme fallback)
    (SITE / "wordmark.svg").write_text(horizontal(wm, PRIMARY, AQUA, "wm-type", "wm-bar", ' class="wordmark"'))
    proofs(heights)


def proofs(heights):
    from PIL import Image, ImageDraw, ImageFont
    backgrounds = [(BG, "#f3f5f0 page", "light"), ("#ffffff", "#ffffff white", "light"),
                   (PRIMARY, "#0f3d47 primary", "dark"), (AQUA, "#16a39f aqua", "aqua")]
    pick = {
        "light": {"wordmark": "wordmark", "h": "lockup-horizontal", "s": "lockup-stacked"},
        "dark": {"wordmark": "wordmark-reverse", "h": "lockup-horizontal-reverse", "s": "lockup-stacked-reverse"},
        "aqua": {"wordmark": "wordmark-on-aqua", "h": "lockup-horizontal-on-aqua", "s": "lockup-stacked-on-aqua"},
    }
    rows = [("wordmark", 96, "Wordmark, 96 px high"), ("wordmark", 24, "Wordmark, 24 px high"),
            ("h", 110, "Horizontal lockup, 110 px"), ("h", 24, "Horizontal lockup, 24 px"),
            ("s", 220, "Stacked lockup, 220 px"), ("s", 64, "Stacked lockup, 64 px")]
    col_w, pad, label_h = 760, 28, 26
    try:
        lf = ImageFont.truetype(LABEL_FONT, 15, layout_engine=ImageFont.Layout.BASIC)
        hf = ImageFont.truetype(LABEL_FONT, 22, layout_engine=ImageFont.Layout.BASIC)
    except OSError:
        lf = hf = ImageFont.load_default()
    row_hs = [h + 2 * pad + label_h for _, h, _ in rows]
    sheet = Image.new("RGB", (col_w * len(backgrounds), 70 + sum(row_hs)), "#ffffff")
    d = ImageDraw.Draw(sheet)
    d.text((pad, 22), "Talkeven wordmark proofs: talk | even, Fraunces 600 outlined", font=hf, fill=INK)
    with tempfile.TemporaryDirectory() as tmp:
        for ci, (bg, name, kind) in enumerate(backgrounds):
            x0 = ci * col_w
            d.rectangle([x0, 70, x0 + col_w, sheet.height], fill=bg)
            y = 70
            label_col = INK if kind != "dark" else CREAM
            for (key, h, label), rh in zip(rows, row_hs):
                src = pick[kind][key]
                out = Path(tmp) / f"{src}-{h}.png"
                if not out.exists():
                    png(BRAND / f"{src}.svg", out, h)
                im = Image.open(out).convert("RGBA")
                d.text((x0 + pad, y + 10), f"{name}: {label}", font=lf, fill=label_col)
                sheet.paste(im, (x0 + pad, y + label_h + pad), im)
                y += rh
    sheet.save(BRAND / "wordmark-proofs.png", optimize=True)


if __name__ == "__main__":
    main()
