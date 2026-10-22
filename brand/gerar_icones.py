"""Ícones do site e do app a partir do ensō a pincel (apps/site/img/enso.webp): anel em jade (ou tinta) com a vela jade no centro.

uso: python brand/gerar_icones.py apps/site apps/web/public brand   (precisa de numpy e pillow)
"""
import base64, io, sys
import numpy as np
from PIL import Image, ImageDraw

SITE, WEB, BRAND = sys.argv[1:4]
JADE, TINTA, PAPEL = (61, 220, 142), (7, 12, 10), (230, 238, 232)
enso = Image.open(f"{SITE}/img/enso.webp").convert("RGBA")  # 760x760, anel em papel
ALFA = np.asarray(enso)[..., 3].astype(float) / 255
# a vela no espaço do ensō (o mesmo do hero: imagem 1140 em 1459,185; vela em 2003/1974)
VELA = [(544 / 1140, 383 / 1140, 18 / 1140, 400 / 1140, 9 / 1140), (515 / 1140, 467 / 1140, 76 / 1140, 232 / 1140, 10 / 1140)]


def simbolo(lado, anel=JADE, fundo=None, margem=0.0, grosso=1.0):
    SS = 4
    L = lado * SS
    tela = Image.new("RGBA", (L, L), fundo + (255,) if fundo else (0, 0, 0, 0))
    m = int(L * margem)
    a = Image.fromarray((ALFA * 255).astype(np.uint8)).resize((L - 2 * m, L - 2 * m), Image.LANCZOS)
    cor = Image.new("RGBA", a.size, anel + (255,))
    tela.paste(cor, (m, m), a)
    d = ImageDraw.Draw(tela)
    s = L - 2 * m
    for i, (x, y, w, h, r) in enumerate(VELA):
        extra = (grosso - 1) * w * s / 2
        d.rounded_rectangle([m + x * s - extra, m + y * s, m + (x + w) * s + extra, m + (y + h) * s], radius=r * s * grosso, fill=JADE + (255,))
    return tela.resize((lado, lado), Image.LANCZOS)


def salvar(img, caminho, **kw):
    img.save(caminho, **kw)
    print(caminho, img.size)


# app (apps/web/public)
salvar(simbolo(32, grosso=2.2), f"{WEB}/favicon-32.png")
salvar(simbolo(192, margem=0.06), f"{WEB}/icone-192.png")
salvar(simbolo(512, margem=0.06), f"{WEB}/icone-512.png")
salvar(simbolo(180, fundo=TINTA, margem=0.12).convert("RGB"), f"{WEB}/apple-touch-icon.png")
for nome in ("enso.webp",):
    enso.save(f"{WEB}/{nome}", lossless=False, quality=88)
# svg com o raster embutido (o favicon em svg e o manifesto continuam apontando para /simbolo.svg)
def svg(img, rotulo="ZenTrade"):
    buf = io.BytesIO(); img.save(buf, "WEBP", quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="{rotulo}"><image width="256" height="256" href="data:image/webp;base64,{b64}"/></svg>\n'
open(f"{WEB}/simbolo.svg", "w").write(svg(simbolo(256)))
# marca (brand/)
open(f"{BRAND}/simbolo.svg", "w").write(svg(simbolo(256)))
open(f"{BRAND}/simbolo-claro.svg", "w").write(svg(simbolo(256, anel=TINTA)))
salvar(simbolo(1024, margem=0.04), f"{BRAND}/simbolo.png")
# imagem social: a mesma do site
social = Image.open(f"{SITE}/img/social.jpg").convert("RGB")
salvar(social, f"{WEB}/og.png")
salvar(social, f"{WEB}/og.webp", quality=88)

# site (apps/site/img): o mesmo símbolo do app
salvar(simbolo(256), f"{SITE}/img/simbolo.webp", lossless=True)
salvar(simbolo(32, grosso=2.2), f"{SITE}/img/favicon-32.png")
salvar(simbolo(192, margem=0.06), f"{SITE}/img/favicon-192.png")
salvar(simbolo(180, fundo=TINTA, margem=0.12).convert("RGB"), f"{SITE}/img/apple-touch-icon.png")
