import type { DecisaoDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import { dec } from "@zentrade/dominio";
import { ArrowDownRight, ArrowUpRight, Check, ShieldCheck, ShieldX, X } from "lucide-react";
import { mensagemDe } from "../../api/erros";
import { useAprovarDecisao, useRecusarDecisao } from "../../ganchos/mutacoes";
import {
  formatarCustoIa,
  formatarDinheiro,
  formatarPercentual,
  formatarPreco,
  formatarQuantidade,
} from "../../lib/formatar";
import { ACAO, ESTADO_DECISAO } from "../../lib/rotulos";
import { formatarDataHora, formatarRelativo } from "../../lib/tempo";
import { useAvisos } from "../Avisos";
import { Botao } from "../Botao";
import { Dinheiro } from "../Dinheiro";
import { Selo } from "../Selo";
import { Cenarios } from "./Cenarios";
import { Proposta } from "./Proposta";

/**
 * Uma decisão do robô, contada na ordem em que aconteceu: o sinal das regras, o
 * argumento da IA, o veredito do risco e o desfecho. Quando aguarda você, os
 * botões de aprovar e recusar ficam no fim — depois de ler o porquê.
 */
interface Props {
  readonly decisao: DecisaoDTO;
  readonly robo: RoboDTO | undefined;
  readonly compacto?: boolean;
}

function valorTotal(d: DecisaoDTO): string | null {
  if (!d.quantidade) return null;
  try {
    return dec(d.preco).times(d.quantidade).toFixed(2);
  } catch {
    return null;
  }
}

function Cabeca({ decisao: d, robo }: Pick<Props, "decisao" | "robo">) {
  const estado = ESTADO_DECISAO[d.estado];
  const compra = d.sinal.acao !== "VENDER";
  return (
    <header className="decisao__topo">
      <span className={`decisao__acao ${compra ? "decisao__acao--compra" : "decisao__acao--venda"}`}>
        {compra ? (
          <ArrowUpRight size={16} aria-hidden="true" />
        ) : (
          <ArrowDownRight size={16} aria-hidden="true" />
        )}
        {ACAO[d.sinal.acao]}
      </span>
      <p className="decisao__quem">
        <strong>{robo?.nome ?? "Robô removido"}</strong>
        <span className="apagado"> · {robo?.simbolo ?? "—"}</span>
      </p>
      <time
        className="decisao__quando apagado"
        dateTime={new Date(d.em).toISOString()}
        title={formatarDataHora(d.em)}
      >
        {formatarRelativo(d.em)}
      </time>
      <Selo tom={estado.tom} icone={estado.icone}>
        {estado.texto}
      </Selo>
    </header>
  );
}

function Numeros({ decisao: d }: Pick<Props, "decisao">) {
  const total = valorTotal(d);
  return (
    <dl className="decisao__numeros">
      <div>
        <dt>Preço</dt>
        <dd className="num">{formatarPreco(d.preco)}</dd>
      </div>
      {d.quantidade ? (
        <div>
          <dt>Quantidade</dt>
          <dd className="num">{formatarQuantidade(d.quantidade)}</dd>
        </div>
      ) : null}
      {total ? (
        <div>
          <dt>Valor</dt>
          <dd className="num">{formatarDinheiro(total)}</dd>
        </div>
      ) : null}
      <div>
        <dt>Custo de IA</dt>
        <dd className="num">{d.custoIaUsd ? formatarCustoIa(d.custoIaUsd) : "sem IA"}</dd>
      </div>
      {d.desfecho ? (
        <div>
          <dt>Desfecho</dt>
          <dd>
            <Dinheiro valor={d.desfecho.resultado} sinal colorir />
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function Risco({ decisao: d }: Pick<Props, "decisao">) {
  if (d.risco.aprovada) {
    return (
      <p className="decisao__risco decisao__risco--ok">
        <ShieldCheck size={16} aria-hidden="true" /> Passou por todas as barreiras do risco.
      </p>
    );
  }
  // O motor também registra aqui quando a IA não concordou (agente_*): não é o risco que barrou.
  const daIa = d.risco.barreiras.filter((b) => b.codigo.startsWith("agente_"));
  const doRisco = d.risco.barreiras.filter((b) => !b.codigo.startsWith("agente_"));
  return (
    <div className="decisao__risco decisao__risco--barrada">
      {daIa.length > 0 ? (
        <ListaBarreiras titulo="A IA não concordou, então nada foi enviado:" itens={daIa} />
      ) : null}
      {doRisco.length > 0 ? <ListaBarreiras titulo="O risco barrou:" itens={doRisco} /> : null}
    </div>
  );
}

function ListaBarreiras({
  titulo,
  itens,
}: {
  readonly titulo: string;
  readonly itens: readonly { codigo: string; mensagem: string }[];
}) {
  return (
    <>
      <p>
        <ShieldX size={16} aria-hidden="true" /> {titulo}
      </p>
      <ul role="list">
        {itens.map((b) => (
          <li key={b.codigo}>{b.mensagem}</li>
        ))}
      </ul>
    </>
  );
}

function Resposta({ decisao: d }: Pick<Props, "decisao">) {
  const aprovar = useAprovarDecisao();
  const recusar = useRecusarDecisao();
  const avisar = useAvisos();
  const ocupado = aprovar.isPending || recusar.isPending;
  const opcoes = (texto: string) => ({
    onSuccess: () => avisar("sucesso", texto),
    onError: (e: unknown) => avisar("erro", mensagemDe(e)),
  });
  return (
    <footer className="decisao__resposta">
      <p className="decisao__pergunta">
        {d.proposta?.confianca !== undefined
          ? `Confiança da IA: ${formatarPercentual(d.proposta.confianca, { casas: 0 })}. `
          : ""}
        Você aprova esta ordem?
      </p>
      <div className="decisao__botoes">
        <Botao
          variante="secundario"
          icone={X}
          disabled={ocupado}
          carregando={recusar.isPending}
          onClick={() => recusar.mutate(d.id, opcoes("Recusada. Nenhuma ordem foi enviada."))}
        >
          Recusar
        </Botao>
        <Botao
          variante="primario"
          icone={Check}
          disabled={ocupado}
          carregando={aprovar.isPending}
          onClick={() => aprovar.mutate(d.id, opcoes("Aprovada. A ordem vai para a corretora."))}
        >
          Aprovar
        </Botao>
      </div>
    </footer>
  );
}

export function CartaoDecisao({ decisao: d, robo, compacto = false }: Props) {
  return (
    <article
      className={`decisao decisao--${d.estado} ${compacto ? "decisao--compacta" : ""}`}
      aria-label={`${ACAO[d.sinal.acao]} de ${robo?.nome ?? "robô"}, ${ESTADO_DECISAO[d.estado].texto}`}
    >
      <Cabeca decisao={d} robo={robo} />
      <Numeros decisao={d} />
      {compacto ? null : (
        <>
          <section className="decisao__bloco">
            <h3 className="decisao__subtitulo">Por que o sinal disparou</h3>
            <p className="decisao__explicacao">{d.sinal.explicacao}</p>
          </section>
          {d.proposta ? <Proposta proposta={d.proposta} /> : null}
          {d.proposta ? <Cenarios proposta={d.proposta} /> : null}
          <section className="decisao__bloco">
            <h3 className="decisao__subtitulo">O que o risco decidiu</h3>
            <Risco decisao={d} />
          </section>
        </>
      )}
      {d.estado === "aguardando_aprovacao" ? <Resposta decisao={d} /> : null}
    </article>
  );
}
