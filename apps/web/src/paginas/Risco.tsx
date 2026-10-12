import { Link } from "@tanstack/react-router";
import { ArrowRight, Gauge, OctagonX, Play, ShieldAlert, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { mensagemDe } from "../api/erros";
import { useAvisos } from "../componentes/Avisos";
import { Botao } from "../componentes/Botao";
import { BotaoSegurar } from "../componentes/BotaoSegurar";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { useDecisoes, useResumo, useRobos } from "../ganchos/consultas";
import { lojaBarreiras } from "../ganchos/lojas";
import { useParadaTotal } from "../ganchos/mutacoes";
import { formatarDinheiro, formatarPercentual } from "../lib/formatar";
import { useLoja } from "../lib/loja";
import { formatarRelativo } from "../lib/tempo";
import { FormLimites } from "./risco/FormLimites";
import { useSituacaoConta } from "./risco/ganchos";
import { PainelAvisos } from "./risco/PainelAvisos";
import { PainelConta } from "./risco/PainelConta";
import { PainelDivergencias } from "./risco/PainelDivergencias";
import { PainelOrcamentoIa } from "./risco/PainelOrcamentoIa";
import { PainelPausas } from "./risco/PainelPausas";

function ParadaTotal() {
  const resumo = useResumo();
  const parada = useParadaTotal();
  const avisar = useAvisos();
  if (resumo.isPending) return <Esqueleto altura={160} rotulo="Carregando o estado da parada total" />;
  if (resumo.error) return <ErroCarregar erro={resumo.error} tentarDeNovo={() => void resumo.refetch()} />;
  const ligada = resumo.data.paradaTotal;
  const definir = (valor: boolean): void =>
    parada.mutate(valor, {
      onSuccess: () =>
        avisar(
          valor ? "info" : "sucesso",
          valor
            ? "Parada total ligada. Nenhum robô envia ordens."
            : "Parada total desligada. Os robôs voltam a seguir seus modos.",
        ),
      onError: (e) => avisar("erro", mensagemDe(e)),
    });

  if (ligada) {
    return (
      <section className="parada parada--ligada" aria-labelledby="titulo-parada">
        <span className="parada__simbolo" aria-hidden="true">
          <OctagonX size={26} />
        </span>
        <div>
          <h2 id="titulo-parada" className="parada__titulo">
            Parada total ligada
          </h2>
          <p>
            Nenhum robô analisa nem envia ordens. Posições abertas continuam na corretora com os stops que já
            estavam lá.
          </p>
        </div>
        <Botao
          variante="secundario"
          icone={Play}
          carregando={parada.isPending}
          onClick={() => definir(false)}
        >
          Desligar parada total
        </Botao>
        <p className="parada__nota">Para desligar, você vai confirmar sua identidade.</p>
      </section>
    );
  }
  return (
    <section className="parada" aria-labelledby="titulo-parada">
      <span className="parada__simbolo" aria-hidden="true">
        <OctagonX size={26} />
      </span>
      <div>
        <h2 id="titulo-parada" className="parada__titulo">
          Parada total
        </h2>
        <p>
          Para todos os robôs na hora: nada é analisado e nenhuma ordem nova sai. Use quando algo parecer
          errado — é melhor parar e olhar.
        </p>
      </div>
      <BotaoSegurar aoConfirmar={() => definir(true)} desabilitado={parada.isPending}>
        <OctagonX size={18} aria-hidden="true" /> Segure para parar tudo
      </BotaoSegurar>
    </section>
  );
}

function Limites() {
  const robos = useRobos();
  if (robos.isPending) return <Esqueleto forma="lista" linhas={4} rotulo="Carregando limites" />;
  if (robos.error)
    return <ErroCarregar erro={robos.error} tentarDeNovo={() => void robos.refetch()} compacto />;
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead>
          <tr>
            <th scope="col">Robô</th>
            <th scope="col" className="tabela__num">
              Perda diária máx.
            </th>
            <th scope="col" className="tabela__num">
              Exposição máx.
            </th>
            <th scope="col" className="tabela__num">
              Risco por operação
            </th>
            <th scope="col" className="tabela__num">
              Ordens/hora
            </th>
            <th scope="col" className="tabela__num">
              Pausa após perda
            </th>
            <th scope="col" className="tabela__num">
              Confiança mín.
            </th>
          </tr>
        </thead>
        <tbody>
          {robos.data.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.nome}</th>
              <td className="tabela__num num">{formatarDinheiro(r.limites.perdaDiariaMaxima)}</td>
              <td className="tabela__num num">{formatarDinheiro(r.limites.exposicaoMaxima)}</td>
              <td className="tabela__num num">{formatarDinheiro(r.limites.riscoPorOperacao)}</td>
              <td className="tabela__num num">{r.limites.ordensPorHoraMax}</td>
              <td className="tabela__num num">{r.limites.pausaAposPerdaMin} min</td>
              <td className="tabela__num num">
                {formatarPercentual(r.limites.confiancaMinima, { casas: 0 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Barreiras() {
  const aoVivo = useLoja(lojaBarreiras, (s) => s);
  const robos = useRobos().data ?? [];
  const barradas = useDecisoes({ estado: "barrada", limite: 10 }).data ?? [];
  const itens = [
    ...aoVivo.map((b) => ({
      chave: `v-${b.em}-${b.codigo}`,
      roboId: b.roboId,
      mensagem: b.mensagem,
      em: b.em,
    })),
    ...barradas.flatMap((d) =>
      d.risco.barreiras.map((b) => ({
        chave: `${d.id}-${b.codigo}`,
        roboId: d.roboId,
        mensagem: b.mensagem,
        em: d.em,
      })),
    ),
  ]
    .filter((x, i, todos) => todos.findIndex((y) => y.mensagem === x.mensagem && y.em === x.em) === i)
    .sort((a, b) => b.em - a.em)
    .slice(0, 12);
  if (itens.length === 0)
    return (
      <EstadoVazio compacto icone={ShieldCheck} titulo="Nada barrado recentemente">
        Quando o motor de risco barrar uma ordem, o motivo aparece aqui.
      </EstadoVazio>
    );
  return (
    <ul role="list" className="barreiras">
      {itens.map((b) => (
        <li key={b.chave}>
          <span className="barreiras__icone" aria-hidden="true">
            <ShieldAlert size={15} />
          </span>
          <span>
            <strong>{robos.find((r) => r.id === b.roboId)?.nome ?? "Robô"}</strong> — {b.mensagem}
          </span>
          <span className="apagado">{formatarRelativo(b.em)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Limites da conta (todos os robôs da pessoa), pausas, orçamento de IA e o formulário. */
function Conta() {
  const situacao = useSituacaoConta();
  if (situacao.isPending) return <Esqueleto altura={220} rotulo="Carregando os limites da conta" />;
  if (situacao.error)
    return <ErroCarregar erro={situacao.error} tentarDeNovo={() => void situacao.refetch()} />;
  const s = situacao.data;
  return (
    <>
      <PainelPausas pausas={s.pausas} agora={s.em} />
      <div className="grade-dupla">
        <PainelConta situacao={s} />
        <PainelOrcamentoIa orcamento={s.orcamentoIa} limites={s.limites} />
      </div>
      <PainelDivergencias />
      <Painel
        titulo="Limites da conta"
        id="titulo-limites-conta"
        icone={SlidersHorizontal}
        descricao="Valem para todos os robôs juntos, além dos limites de cada um. Só barram compras."
      >
        <FormLimites key={JSON.stringify(s.limites)} limites={s.limites} />
      </Painel>
    </>
  );
}

export function Risco() {
  return (
    <>
      <Cabecalho titulo="Risco">
        O motor de risco é código simples e testado, sem IA. A IA propõe; ele aprova ou barra. Se a IA errar,
        o pior que acontece é não operar.
      </Cabecalho>
      <ParadaTotal />
      <div className="pilha">
        <Conta />
        <PainelAvisos />
        <Painel
          titulo="Limites por robô"
          id="titulo-limites"
          icone={Gauge}
          descricao="O motor confere cada ordem contra estes números antes de enviar."
          acoes={
            <Link to="/robos" className="link-seta">
              Editar nos robôs <ArrowRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          <Limites />
        </Painel>
        <Painel titulo="Barrado recentemente" id="titulo-barreiras" icone={ShieldAlert}>
          <Barreiras />
        </Painel>
      </div>
    </>
  );
}
