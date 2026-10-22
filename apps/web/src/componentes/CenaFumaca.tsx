import { useEffect, useRef } from "react";
import { useMenosMovimento } from "../ganchos/movimento";

/**
 * A cena do topo do site, em WebGL: fundo de tinta, a linha do horizonte acesa no
 * centro da vela e uma fumaça lenta na parte de baixo. Sem bibliotecas; a resolução
 * cai sozinha se a máquina não aguentar, para quando sai da tela e fica parada para
 * quem pediu menos movimento. Sem WebGL, não desenha nada (o fundo da página fica).
 *
 * `alvo` é o seletor (dentro do mesmo pai) do elemento cujo centro passa o horizonte.
 */
interface Props {
  readonly alvo: string;
  readonly className?: string;
}

const VS = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
const FS = `precision mediump float;
varying vec2 v;
uniform vec2 tela, centro;
uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float rn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*rn(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return s/.9375;}
float fbm3(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*rn(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return s/.875;}
void main(){
  vec2 fp=vec2(v.x*tela.x,(1.-v.y)*tela.y);
  float H=tela.y, hy=centro.y;
  vec3 cor=mix(vec3(.028,.032,.031),vec3(.05,.056,.054),smoothstep(0.,hy,fp.y));
  if(fp.y>hy) cor=mix(vec3(.045,.05,.048),vec3(.022,.025,.024),smoothstep(hy,H,fp.y));
  float dyh=abs(fp.y-hy);
  float dx=(fp.x-centro.x)/tela.x;
  vec3 jade=vec3(.24,.86,.56);
  cor+=jade*(exp(-dyh/(H*.003))*.26+exp(-dyh/(H*.07))*.035)*exp(-dx*dx*3.);
  float banda=smoothstep(H*.34,H*.56,fp.y);
  if(banda>.001){
    vec2 p=fp/H*vec2(2.6,3.4)+vec2(t*.018,-t*.012);
    vec2 w=vec2(fbm3(p*.8+vec2(0.,t*.015)),fbm3(p*.8+vec2(5.2,1.3)-t*.01));
    float d=fbm(p+2.*w);
    float dens=smoothstep(.45,.82,d)*banda*(.5+.5*smoothstep(hy,H*.95,fp.y));
    vec3 fum=mix(vec3(.36,.4,.38),vec3(.78,.81,.79),smoothstep(.55,.95,d));
    cor=mix(cor,fum,clamp(dens*.7,0.,.55));
  }
  vec2 c2=v-.5;
  cor*=1.-dot(c2,c2)*.45;
  gl_FragColor=vec4(cor,1.);
}`;

/** Resolução da tela em relação ao tamanho do elemento (a fumaça é suave; não precisa de mais). */
const ESCALA_BASE = 0.42;
const LARGURA_MAXIMA = 640;
/** Acima disto (ms por quadro, em média), a resolução cai 20%, até 41% do tamanho. */
const QUADRO_LENTO = 22;

function compilar(gl: WebGLRenderingContext, tipo: number, fonte: string): WebGLShader {
  const s = gl.createShader(tipo);
  if (!s) throw new Error("sem shader");
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

function programa(gl: WebGLRenderingContext): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("sem programa");
  gl.attachShader(p, compilar(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compilar(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "programa");
  return p;
}

export function CenaFumaca({ alvo, className }: Props) {
  const tela = useRef<HTMLCanvasElement>(null);
  const menos = useMenosMovimento();

  useEffect(() => {
    const canvas = tela.current;
    const palco = canvas?.parentElement;
    const gl = canvas?.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!canvas || !palco || !gl) return;
    let prog: WebGLProgram;
    try {
      prog = programa(gl);
    } catch (erro) {
      console.error("cena de fumaça:", erro);
      return;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uTela = gl.getUniformLocation(prog, "tela");
    const uCentro = gl.getUniformLocation(prog, "centro");
    const uT = gl.getUniformLocation(prog, "t");

    let fator = 1;
    let visivel = true;
    let quadro = 0;
    let alterna = false;
    let anterior = 0;
    let soma = 0;
    let amostras = 0;
    const inicio = performance.now();

    const ajustar = (): void => {
      const r = palco.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const escala = Math.min(ESCALA_BASE, LARGURA_MAXIMA / r.width) * fator;
      canvas.width = Math.max(1, Math.round(r.width * escala));
      canvas.height = Math.max(1, Math.round(r.height * escala));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uTela, canvas.width, canvas.height);
      const v = palco.querySelector(alvo)?.getBoundingClientRect();
      const cx = v?.width ? v.left + v.width / 2 - r.left : r.width / 2;
      const cy = v?.height ? v.top + v.height / 2 - r.top : r.height / 2;
      gl.uniform2f(uCentro, cx * escala, cy * escala);
    };
    const desenhar = (agora: number): void => {
      gl.uniform1f(uT, menos ? 0 : (agora - inicio) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const medir = (agora: number): void => {
      const passo = agora - anterior;
      anterior = agora;
      if (passo <= 0 || passo > 250) return;
      soma += passo;
      if (++amostras < 60) return;
      const lento = soma / amostras > QUADRO_LENTO && fator > 0.45;
      amostras = 0;
      soma = 0;
      if (!lento) return;
      fator *= 0.8;
      ajustar();
    };
    /* a fumaça anda devagar: um quadro sim, um não basta */
    const laco = (agora: number): void => {
      medir(agora);
      alterna = !alterna;
      if (!alterna) desenhar(agora);
      quadro = visivel && !document.hidden ? requestAnimationFrame(laco) : 0;
    };
    const acordar = (): void => {
      if (menos || quadro || !visivel || document.hidden) return;
      anterior = 0;
      quadro = requestAnimationFrame(laco);
    };

    ajustar();
    desenhar(performance.now());
    const tamanho = new ResizeObserver(() => {
      ajustar();
      desenhar(performance.now());
    });
    tamanho.observe(palco);
    const vista = new IntersectionObserver(([e]) => {
      visivel = e?.isIntersecting ?? true;
      acordar();
    });
    vista.observe(palco);
    document.addEventListener("visibilitychange", acordar);
    /* o ensō anima no começo: reposiciona o horizonte quando ele termina de entrar */
    const reajuste = window.setTimeout(ajustar, 1600);
    acordar();
    return () => {
      cancelAnimationFrame(quadro);
      window.clearTimeout(reajuste);
      tamanho.disconnect();
      vista.disconnect();
      document.removeEventListener("visibilitychange", acordar);
    };
  }, [alvo, menos]);

  return <canvas ref={tela} className={className} aria-hidden="true" />;
}
