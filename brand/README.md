# Marca ZenTrade

**Símbolo: Ensō.** O círculo do zen pintado a pincel num traço só, com a vela no centro. O círculo é a calma, a vela é a decisão: o robô passa a maior parte do tempo esperando e age só quando há motivo. O site e o app usam o mesmo símbolo, gerado da mesma pintura (`apps/site/img/enso.webp`).

| Arquivo             | Uso                                                 |
| ------------------- | --------------------------------------------------- |
| `simbolo.svg`       | anel jade, vela jade (marca, favicon, fundo escuro) |
| `simbolo-claro.svg` | anel tinta, vela jade (fundo claro)                 |
| `simbolo.png`       | 1024 px, para impressão e redes                     |
| `gerar_icones.py`   | refaz os ícones do site, do app e desta pasta       |

Nas telas grandes (topo do site, entrar no app) o anel aparece em papel de arroz, revelado pela pincelada, e a vela sobe do centro.

**Cores:** tinta `#070C0A` · superfície `#0D1512` · jade `#3DDC8E` · jade profundo `#0E6B47` · papel de arroz `#E6EEE8` · coral `#FF6F61` (perda) · âmbar `#E9B44C` (atenção).

**Tipografia:** Instrument Serif para o nome “ZenTrade” e os títulos; Geist para interface e texto; Geist Mono para todo número.

**Não fazer:** moedas, Bitcoin, setas, escudo, neon, 3D ou brilho no símbolo. O verde é chapado.

**Imagem social:** a mesma do site (`apps/site/img/social.jpg`); `gerar_icones.py` copia para `apps/web/public/og.png` e `og.webp`. `imagem-social.html` é a versão antiga, com o anel geométrico.
