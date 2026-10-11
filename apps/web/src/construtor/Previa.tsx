import { avaliar, dec, NOS_MAXIMOS, precoAlvo, precoStop } from "@zentrade/dominio";
import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Segmentado } from "../componentes/Segmentado";
import { Selo } from "../componentes/Selo";
import { useCandles } from "../ganchos/consultas";
import { formatarPercentual, formatarPreco } from "../lib/formatar";
import { contarNos, paraRegra } from "./arvore";
import { frase, linhas } from "./descrever";
import { fracaoDe, type EstadoConstrutor, type Montagem } from "./estado";

/**
 * Prévia ao vivo: a regra em palavras (com os mesmos rótulos do domínio), o que
 * ela diria agora no mercado (avaliar do domínio, com a explicação) e o que falta
 * para salvar (validarRegra e validarEstrategia).
 */
const PARES = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

function EmPalavras({ estado }: { readonly estado: EstadoConstrutor }) {
  return (
    <section className="previa__bloco" aria-labelledby="previa-palavras">
      <h3 id="previa-palavras" className="previa__titulo">
        Em palavras
      </h3>
      <p className="previa__frase">
        <strong>Compra quando</strong> {frase(estado.entrada)}.
      </p>
      <ul role="list" className="previa__linhas">
        {linhas(estado.entrada).map((l, i) => (
          <li key={`${i}-${l.nivel}-${l.texto}`} style={{ paddingInlineStart: `${l.nivel * 14}px` }}>
            {l.texto}
          </li>
        ))}
      </ul>
      <p className="previa__frase">
        <strong>Vende quando</strong>{" "}
        {estado.saida ? `${frase(estado.saida)}, ou no stop ou no alvo` : "o preço chegar ao stop ou ao alvo"}
        .
      </p>
    </section>
  );
}

function SeFosseAgora({ estado }: { readonly estado: EstadoConstrutor }) {
  const [par, setPar] = useState<(typeof PARES)[number]>("BTCUSDT");
  const velas = useCandles(par, "1h");
  const regra = paraRegra(estado.entrada).regra;
  const fechamentos = velas.data?.map((v) => Number(v.fecha)) ?? [];
  const resultado = regra && fechamentos.length ? avaliar(regra, { fechamentos }) : null;
  const ultimo = velas.data?.at(-1)?.fecha;
  const stop = fracaoDe(estado.stop);
  const alvo = fracaoDe(estado.alvo);
  const taxa = fracaoDe(estado.taxa);
  return (
    <section className="previa__bloco" aria-labelledby="previa-agora">
      <h3 id="previa-agora" className="previa__titulo">
        Se fosse agora
      </h3>
      <Segmentado
        rotulo="Par para testar"
        ocultarRotulo
        opcoes={PARES.map((p) => ({ valor: p, rotulo: p.replace("USDT", "") }))}
        valor={par}
        aoMudar={setPar}
      />
      {velas.isPending ? <p className="apagado">Buscando candles de 1 h…</p> : null}
      {velas.error ? (
        <p className="apagado">Sem candles de {par} agora; a prévia volta quando a API responder.</p>
      ) : null}
      {resultado ? (
        <div className="previa__resultado" aria-live="polite">
          <Selo
            tom={resultado.valor ? "marca" : "neutro"}
            icone={resultado.valor ? CircleCheck : CircleDashed}
          >
            {resultado.valor ? "Entraria agora" : "Não entraria agora"}
          </Selo>
          <p className="previa__explicacao">{resultado.explicacao}</p>
        </div>
      ) : null}
      {!regra ? <p className="apagado">Complete a regra para ver o resultado.</p> : null}
      {ultimo && stop !== null && alvo !== null && taxa !== null && stop > 0 && alvo > 0 ? (
        <p className="previa__alvo">
          Entrando a <span className="num">{formatarPreco(ultimo)}</span>: stop em{" "}
          <span className="num perda">{formatarPreco(precoStop(dec(ultimo), stop).toFixed())}</span> e alvo em{" "}
          <span className="num ganho">{formatarPreco(precoAlvo(dec(ultimo), alvo, taxa).toFixed())}</span> —{" "}
          {formatarPercentual(alvo)} líquido depois das duas taxas de {formatarPercentual(taxa, { casas: 2 })}
          .
        </p>
      ) : null}
    </section>
  );
}

function Validacao({ estado, montagem }: { readonly estado: EstadoConstrutor; readonly montagem: Montagem }) {
  const partes = contarNos(estado.entrada) + (estado.saida ? contarNos(estado.saida) : 0);
  return (
    <section className="previa__bloco" aria-labelledby="previa-validacao">
      <h3 id="previa-validacao" className="previa__titulo">
        Pronta para salvar?
      </h3>
      {montagem.problemas.length === 0 ? (
        <p className="previa__ok">
          <CircleCheck size={16} aria-hidden="true" /> Tudo certo. A regra passou nas validações do domínio.
        </p>
      ) : (
        <ul role="list" className="previa__problemas" aria-live="polite">
          {montagem.problemas.map((p) => (
            <li key={p}>
              <TriangleAlert size={14} aria-hidden="true" /> {p[0]?.toUpperCase()}
              {p.slice(1)}.
            </li>
          ))}
        </ul>
      )}
      <p className="apagado previa__partes">
        <span className="num">{partes}</span> de <span className="num">{NOS_MAXIMOS}</span> partes usadas
      </p>
    </section>
  );
}

export function Previa({
  estado,
  montagem,
}: {
  readonly estado: EstadoConstrutor;
  readonly montagem: Montagem;
}) {
  return (
    <aside className="previa" aria-label="Prévia da estratégia">
      <EmPalavras estado={estado} />
      <SeFosseAgora estado={estado} />
      <Validacao estado={estado} montagem={montagem} />
    </aside>
  );
}
