#!/usr/bin/env python3
"""Genera i due moduli con la foto dell'autore, da una sola immagine sorgente.

La pagina esca mostra una piccola foto nella riga dell'autore, e la mostra come
data URI dentro l'HTML: niente rotta in piu', niente file da servire, niente riga
in piu' nel registro quando un crawler la scarica. La stringa sta in un modulo
separato per tenere leggibile il template, ma il modulo esiste due volte perche'
le due superfici hanno due sintassi diverse:

    apps/doesitcrawl/src/avatar.js          ESM, per il Worker
    apps/doesitcrawl-mirror/api/avatar.js   CommonJS, per Vercel

Le due stringhe devono essere identiche, e tools/page-parity.mjs lo verifica.

    python tools/build-avatar.py FOTO
    python tools/build-avatar.py FOTO --zoom 0.6 --focus 0.5,0.42   # inquadra il volto

--zoom e' la frazione del lato piu' corto da tenere, --focus il centro del ritaglio
in coordinate 0-1. L'uscita e' un JPEG quadrato a colori: in una pagina solo nero e
bianco la foto resta l'unico punto di colore, ed e' voluto. --gray la converte in
scala di grigi.
"""
import argparse
import base64
import io
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
TARGETS = {
    ROOT / "apps/doesitcrawl/src/avatar.js":
        "// Generato da tools/build-avatar.py: non modificare a mano.\nexport const AVATAR = '%s';\n",
    ROOT / "apps/doesitcrawl-mirror/api/avatar.js":
        "// Generato da tools/build-avatar.py: non modificare a mano.\nmodule.exports = { AVATAR: '%s' };\n",
}


def main() -> int:
    p = argparse.ArgumentParser(description="Genera i moduli avatar da una foto.")
    p.add_argument("photo", type=Path)
    p.add_argument("--size", type=int, default=160, help="lato in pixel (default 160, mostrato a 40 CSS px)")
    p.add_argument("--quality", type=int, default=80)
    p.add_argument("--zoom", type=float, default=1.0, help="frazione del lato corto da tenere (default 1)")
    p.add_argument("--focus", default="0.5,0.5", help="centro del ritaglio, x,y in 0-1")
    p.add_argument("--gray", action="store_true", help="converte in scala di grigi invece di lasciare i colori")
    a = p.parse_args()

    img = ImageOps.exif_transpose(Image.open(a.photo))
    side = int(min(img.size) * max(0.05, min(1.0, a.zoom)))
    fx, fy = (float(v) for v in a.focus.split(","))
    left = min(max(int(img.width * fx - side / 2), 0), img.width - side)
    top = min(max(int(img.height * fy - side / 2), 0), img.height - side)
    img = img.crop((left, top, left + side, top + side))
    img = img.convert("L" if a.gray else "RGB").resize((a.size, a.size), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=a.quality, optimize=True, progressive=True)
    data = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    for path, template in TARGETS.items():
        path.write_text(template % data, encoding="utf-8", newline="\n")
        print(f"scritto {path.relative_to(ROOT)}")
    print(f"{a.size}x{a.size}, {len(buf.getvalue())} byte di JPEG, {len(data)} caratteri nella pagina")
    return 0


if __name__ == "__main__":
    sys.exit(main())
