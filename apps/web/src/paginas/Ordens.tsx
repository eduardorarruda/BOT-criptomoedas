import type { OrdemDTO, PosicaoDTO, RoboDTO } from "@zentrade/contratos";
import { ArrowLeftRight, Wallet } from "lucide-react";
import { Cabecalho, Painel } from "../componentes/Cabecalho";
import { Dinheiro } from "../componentes/Dinheiro";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../componentes/Estados";
import { PrecoAoVivo } from "../componentes/PrecoAoVivo";
import { Selo } from "../componentes/Selo";
import { useDecisoes, useOrdens, usePosicoes, useRobos } from "../ganchos/consultas";
import { lojaPrecos } from "../ganchos/lojas";
import { formatarDinheiro, formatarPreco, formatarQuantidade } from "../lib/formatar";
import { useLoja } from "../lib/loja";
import { naoRealizado, precoMedioExecucoes, taxaTotal, temQuantidade } from "../lib/posicao";
import { ESTADO_ORDEM } from "../lib/rotulos";
import { formatarDataHora } from "../lib/tempo";

function LinhaPosicao({
  posicao: p,
  robo,
}: {
  readonly posicao: PosicaoDTO;
  readonly robo: RoboDTO | undefined;
}) {
  const atual = useLoja(lojaPrecos, (s) => s[p.simbolo]?.preco);
  const aberta = temQuantidade(p.quantidade);
  return (
    <tr>
      <th scope="row">{robo?.nome ?? p.roboId}</th>
      <td>{p.simbolo}</td>
      <td className="tabela__num num">
        {aberta ? formatarQuantidade(p.quantidade) : <span className="apagado">zerada</span>}
      </td>
      <td className="tabela__num num">{aberta ? formatarPreco(p.precoMedio) : "—"}</td>
      <td className="tabela__num">{aberta ? <PrecoAoVivo simbolo={p.simbolo} /> : "—"}</td>
      <td className="tabela__num">
        {aberta && atual ? (
          <Dinheiro valor={naoRealizado(p.quantidade, p.precoMedio, atual)} sinal colorir />
        ) : (
          "—"
        )}
      </td>
      <td className="tabela__num">
        <Dinheiro valor={p.resultadoRealizado} sinal colorir />
      </td>
      <td className="tabela__num">
        <Dinheiro valor={p.taxasPagas} className={temQuantidade(p.taxasPagas) ? "perda" : "apagado"} />
      </td>
    </tr>
  );
}

function Posicoes({ robos }: { readonly robos: readonly RoboDTO[] }) {
  const consultas = usePosicoes(robos.map((r) => r.id));
  const carregando = consultas.some((c) => c.isPending);
  const erro = consultas.find((c) => c.error);
  const posicoes = consultas.flatMap((c) => (c.data ? [c.data] : []));
  if (carregando) return <Esqueleto linhas={4} rotulo="Carregando posições" />;
  if (erro?.error) return <ErroCarregar erro={erro.error} tentarDeNovo={() => void erro.refetch()} />;
  if (posicoes.length === 0)
    return (
      <EstadoVazio icone={Wallet} titulo="Nenhuma posição">
        A posição de cada robô é calculada a partir das execuções confirmadas pela corretora.
      </EstadoVazio>
    );
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <caption className="so-leitor">Posição de cada robô, derivada das execuções</caption>
        <thead>
          <tr>
            <th scope="col">Robô</th>
            <th scope="col">Par</th>
            <th scope="col" className="tabela__num">
              Quantidade
            </th>
            <th scope="col" className="tabela__num">
              Preço médio
            </th>
            <th scope="col" className="tabela__num">
              Preço agora
            </th>
            <th scope="col" className="tabela__num">
              Não realizado
            </th>
            <th scope="col" className="tabela__num">
              Realizado (líquido)
            </th>
            <th scope="col" className="tabela__num">
              Taxas pagas
            </th>
          </tr>
        </thead>
        <tbody>
          {posicoes.map((p) => (
            <LinhaPosicao key={p.roboId} posicao={p} robo={robos.find((r) => r.id === p.roboId)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaOrdem({ ordem: o, robo }: { readonly ordem: OrdemDTO; readonly robo: RoboDTO | undefined }) {
  const estado = ESTADO_ORDEM[o.estado];
  const medio = precoMedioExecucoes(o.execucoes);
  return (
    <tr>
      <td className="num">{formatarDataHora(o.criadaEm)}</td>
      <td>{robo?.nome ?? "—"}</td>
      <td>{o.simbolo}</td>
      <td>{o.lado === "COMPRA" ? "Compra" : "Venda"}</td>
      <td className="tabela__num num">{formatarQuantidade(o.quantidade)}</td>
      <td className="tabela__num num">{medio ? formatarPreco(medio) : "—"}</td>
      <td className="tabela__num num perda">
        {o.execucoes.length ? formatarDinheiro(taxaTotal(o.execucoes), { casas: 4 }) : "—"}
      </td>
      <td>
        <Selo tom={estado.tom} icone={estado.icone}>
          {estado.texto}
        </Selo>
        {o.motivo ? <p className="tabela__motivo">{o.motivo}</p> : null}
      </td>
    </tr>
  );
}

export function Ordens() {
  const robosQ = useRobos();
  const robos = robosQ.data ?? [];
  const ordens = useOrdens();
  const decisoes = useDecisoes({ limite: 200 }).data ?? [];
  const roboDaOrdem = (o: OrdemDTO) =>
    robos.find((r) => r.id === decisoes.find((d) => d.id === o.decisaoId)?.roboId);

  return (
    <>
      <Cabecalho titulo="Ordens e posições">
        O que foi para a corretora, o que foi executado e quanto custou em taxas.
      </Cabecalho>
      <Painel titulo="Posições" id="titulo-posicoes">
        {robosQ.isPending ? <Esqueleto linhas={3} /> : <Posicoes robos={robos} />}
      </Painel>
      <Painel titulo="Ordens" id="titulo-ordens">
        {ordens.isPending ? <Esqueleto linhas={6} rotulo="Carregando ordens" /> : null}
        {ordens.error ? (
          <ErroCarregar erro={ordens.error} tentarDeNovo={() => void ordens.refetch()} />
        ) : null}
        {ordens.data?.length === 0 ? (
          <EstadoVazio icone={ArrowLeftRight} titulo="Nenhuma ordem ainda">
            Ordens aparecem quando um robô no modo Automático decide, ou quando você aprova uma sugestão.
          </EstadoVazio>
        ) : null}
        {ordens.data?.length ? (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Robô</th>
                  <th scope="col">Par</th>
                  <th scope="col">Lado</th>
                  <th scope="col" className="tabela__num">
                    Quantidade
                  </th>
                  <th scope="col" className="tabela__num">
                    Preço executado
                  </th>
                  <th scope="col" className="tabela__num">
                    Taxa
                  </th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ordens.data.map((o) => (
                  <LinhaOrdem key={o.id} ordem={o} robo={roboDaOrdem(o)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Painel>
    </>
  );
}
