import type { Carteira as CarteiraDTO, RedeConta, StatusContaBinance } from "@zentrade/contratos/esquemas";
import { Link } from "@tanstack/react-router";
import { dec } from "@zentrade/dominio";
import {
  ChartPie,
  CircleCheck,
  KeyRound,
  LayoutGrid,
  RefreshCw,
  ShieldAlert,
  Table2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { mensagemDe } from "../../api/erros";
import { useAvisos } from "../../componentes/Avisos";
import { Botao } from "../../componentes/Botao";
import { Cabecalho, Painel } from "../../componentes/Cabecalho";
import { ErroCarregar, Esqueleto, EstadoVazio } from "../../componentes/Estados";
import {
  AlternarVisao,
  BarraFiltros,
  filtrarCom,
  FiltroOpcao,
  GrupoFiltro,
  Interruptor,
  SeletorOrdem,
  SemResultados,
  useFiltrosUrl,
  VisoesSalvas,
} from "../../componentes/filtros";
import { Selo } from "../../componentes/Selo";
import { REDE } from "../../lib/rotulos";
import { formatarRelativo } from "../../lib/tempo";
import { CartoesMoedas } from "./CartoesMoedas";
import { CartoesResumo } from "./CartoesResumo";
import { buscaCarteira, NAO_CONTAM, ordemDaBusca, predicadosCarteira, resumirMoedas } from "./filtros";
import { DetalheMoeda } from "./DetalheMoeda";
import { useCarteira, useSincronizar, useStatusBinance } from "./ganchos";
import { GraficoAlocacao } from "./GraficoAlocacao";
import { TabelaMoedas } from "./TabelaMoedas";
import type { Parcela } from "./tabela";
import "./carteira.css";

function BotaoSincronizar({ rede }: { readonly rede: RedeConta | undefined }) {
  const sincronizar = useSincronizar();
  const avisar = useAvisos();
  const aoClicar = () =>
    sincronizar.mutate(rede, {
      onSuccess: (s) => {
        const novas =
          s.negociacoesNovas === 1 ? "1 negociação nova" : `${s.negociacoesNovas} negociações novas`;
        avisar(
          s.parcial ? "info" : "sucesso",
          s.parcial
            ? `Sincronização parcial (${novas}). ${s.avisos.at(-1) ?? ""}`
            : `Carteira sincronizada: ${novas}.`,
        );
      },
      onError: (e) => avisar("erro", mensagemDe(e)),
    });
  return (
    <Botao variante="primario" icone={RefreshCw} carregando={sincronizar.isPending} onClick={aoClicar}>
      {sincronizar.isPending ? "Sincronizando…" : "Sincronizar agora"}
    </Botao>
  );
}

/** Uma faixa por conta com o que a pessoa precisa saber da chave (saque, IP, só leitura). */
function StatusChave({ conta }: { readonly conta: StatusContaBinance }) {
  if (!conta.conectada)
    return (
      <div className="faixa faixa--atencao" role="status">
        <TriangleAlert size={18} aria-hidden="true" />
        <p>
          <strong>
            A Binance ({REDE[conta.rede].texto}) não aceitou a chave {conta.apiKeyFinal}.
          </strong>{" "}
          {conta.erro}
        </p>
      </div>
    );
  const graves = conta.avisos.filter((a) => /SAQUE|IP/.test(a));
  if (graves.length === 0) return null;
  return (
    <div className="faixa faixa--atencao" role="status">
      <ShieldAlert size={18} aria-hidden="true" />
      <p>{graves.join(" ")}</p>
      <Link to="/contas" className="botao botao--secundario botao--pequeno">
        Trocar a chave
      </Link>
    </div>
  );
}

function Situacao({ c }: { readonly c: CarteiraDTO }) {
  const s = c.sincronizacao;
  return (
    <p className="carteira-situacao">
      {c.rede ? <Selo tom={REDE[c.rede].tom}>{REDE[c.rede].texto}</Selo> : null}
      {s ? (
        <Selo tom={s.ok ? "neutro" : "atencao"} icone={s.ok ? CircleCheck : TriangleAlert}>
          {s.ok ? "Sincronizada" : "Sincronização incompleta"} {formatarRelativo(s.em)}
        </Selo>
      ) : null}
      <span className="apagado">Valores em USDT. Uma chave só de leitura basta para a carteira.</span>
    </p>
  );
}

function SemConta() {
  return (
    <EstadoVazio
      icone={KeyRound}
      titulo="Nenhuma conta da Binance conectada"
      acao={
        <Link to="/contas" className="botao botao--primario">
          Cadastrar uma chave
        </Link>
      }
    >
      A carteira lê seus saldos e suas negociações direto da Binance. Uma chave <strong>só de leitura</strong>{" "}
      basta: crie-a sem permissão de saque e presa ao IP do servidor.
    </EstadoVazio>
  );
}

function ComoCalculamos() {
  return (
    <div className="carteira-como">
      <ul>
        <li>
          <strong>Preço médio ponderado</strong>, o mesmo do motor: cada compra soma quantidade × preço ao
          custo; cada venda tira do custo a fração vendida e realiza a diferença para o preço de venda.
        </li>
        <li>
          <strong>Realizado bruto</strong> não desconta taxas; o <strong>líquido</strong> desconta todas
          (compra e venda). <strong>Não realizado</strong> = valor atual − custo da posição.
        </li>
        <li>
          Taxas pagas em BNB, na moeda negociada ou na de cotação são convertidas para USDT pelo preço do
          instante da negociação.
        </li>
        <li>
          Saldo que nenhuma negociação explica (depósito, transferência) aparece como{" "}
          <strong>custo desconhecido</strong>: entra no valor da conta, nunca no preço médio nem no resultado.
        </li>
        <li>
          <strong>Robô</strong> são as ordens enviadas pelo ZenTrade; <strong>manual</strong>, todas as
          outras. Cada parcela tem o próprio preço médio, então a soma das duas pode diferir do total.
        </li>
      </ul>
      <p className="apagado">Números do passado; não são previsão nem recomendação.</p>
    </div>
  );
}

const ORDENACOES = [
  { valor: "alocacao", rotulo: "Fatia da conta", direcao: "desc" },
  { valor: "valorAtual", rotulo: "Valor atual", direcao: "desc" },
  { valor: "naoRealizado", rotulo: "Não realizado", direcao: "desc" },
  { valor: "realizadoLiquido", rotulo: "Realizado líquido", direcao: "desc" },
  { valor: "retorno", rotulo: "Retorno", direcao: "desc" },
  { valor: "taxas", rotulo: "Taxas", direcao: "desc" },
  { valor: "ativo", rotulo: "Moeda (A–Z)", direcao: "asc" },
] as const;

const VISOES = [
  { valor: "tabela", rotulo: "Tabela", icone: Table2 },
  { valor: "cartoes", rotulo: "Cartões", icone: LayoutGrid },
  { valor: "alocacao", rotulo: "Alocação", icone: ChartPie },
] as const;

type Filtros = ReturnType<typeof useFiltrosUrl<typeof buscaCarteira>>;

function BarraMoedas({
  c,
  f,
  parcela,
  mostradas,
}: {
  readonly c: CarteiraDTO;
  readonly f: Filtros;
  readonly parcela: Parcela;
  readonly mostradas: number;
}) {
  const { busca: b, mudar, limpar, aplicar, ativos } = f;
  const ordem = ordemDaBusca(b);
  // Quantas moedas ficariam com o interruptor ligado (e os outros filtros como estão).
  const contar = (nome: "saldo" | "realizado" | "avisos") =>
    filtrarCom(c.moedas, predicadosCarteira({ ...b, [nome]: true }, parcela)).length;
  return (
    <BarraFiltros
      rotulo="Filtros das moedas"
      busca={{
        valor: b.q,
        aoMudar: (q) => mudar({ q }, { substituir: true }),
        rotulo: "Buscar moeda",
        sugestao: "Buscar moeda: BTC, ETH…",
      }}
      ativos={ativos}
      aoLimpar={limpar}
      resumo={
        <>
          <span className="num">{mostradas}</span> de <span className="num">{c.moedas.length}</span> moedas
        </>
      }
      extra={<VisoesSalvas tela="carteira" buscaAtual={b} aoAplicar={aplicar} />}
      ferramentas={
        <>
          <SeletorOrdem
            opcoes={ORDENACOES}
            valor={ORDENACOES.some((o) => o.valor === ordem.coluna) ? ordem.coluna : "alocacao"}
            direcao={ordem.direcao}
            aoMudar={(o, dir) => mudar({ ordem: o === "alocacao" ? undefined : o, dir })}
          />
          <AlternarVisao
            opcoes={VISOES}
            valor={b.visao ?? "tabela"}
            aoMudar={(v) => mudar({ visao: v === "tabela" ? undefined : v })}
          />
        </>
      }
    >
      {c.redes.length > 1 ? (
        <FiltroOpcao
          rotulo="Conta"
          rotuloTodos={null}
          opcoes={c.redes.map((r) => ({ valor: r, rotulo: REDE[r].texto }))}
          valor={b.rede ?? c.rede ?? undefined}
          aoMudar={(rede) => mudar({ rede })}
        />
      ) : null}
      <FiltroOpcao
        rotulo="Parcela"
        rotuloTodos="Total"
        opcoes={[
          { valor: "robo", rotulo: "Robô" },
          { valor: "manual", rotulo: "Manual" },
        ]}
        valor={b.parcela}
        aoMudar={(p) => mudar({ parcela: p })}
      />
      <GrupoFiltro rotulo="Mostrar só">
        <Interruptor
          rotulo="Com saldo"
          ligado={b.saldo === true}
          contagem={contar("saldo")}
          aoMudar={(l) => mudar({ saldo: l || undefined })}
        />
        <Interruptor
          rotulo="Com resultado realizado"
          ligado={b.realizado === true}
          contagem={contar("realizado")}
          aoMudar={(l) => mudar({ realizado: l || undefined })}
        />
        <Interruptor
          rotulo="Com aviso"
          ligado={b.avisos === true}
          contagem={contar("avisos")}
          aoMudar={(l) => mudar({ avisos: l || undefined })}
        />
      </GrupoFiltro>
    </BarraFiltros>
  );
}

function Conteudo({
  c,
  f,
  parcela,
  aoAbrir,
}: {
  readonly c: CarteiraDTO;
  readonly f: Filtros;
  readonly parcela: Parcela;
  readonly aoAbrir: (a: string) => void;
}) {
  if (!c.conectada) return <SemConta />;
  const b = f.busca;
  const filtradas = filtrarCom(c.moedas, predicadosCarteira(b, parcela));
  const recorte = filtradas.length !== c.moedas.length;
  const totais = recorte ? resumirMoedas(filtradas, parcela) : c.resumo[parcela];
  const alocacaoTotal = recorte
    ? filtradas.reduce((s, m) => s.plus(m.alocacao ?? "0"), dec(0)).toFixed(6)
    : "1";
  const ordem = ordemDaBusca(b);
  const visao = b.visao ?? "tabela";
  return (
    <div className="pilha">
      <Situacao c={c} />
      {c.avisos.map((a) => (
        <p key={a} className="carteira-aviso">
          <TriangleAlert size={14} aria-hidden="true" className="atencao" /> {a}
        </p>
      ))}
      <CartoesResumo
        resumo={recorte ? { ...c.resumo, [parcela]: totais } : c.resumo}
        parcela={parcela}
        recorte={recorte ? filtradas.filter((m) => !m.referencia).length : null}
      />
      {c.moedas.length === 0 ? (
        <EstadoVazio icone={Wallet} titulo="Conta vazia">
          A Binance não mostrou saldo nem negociação nesta conta. Depois de comprar ou depositar, sincronize
          de novo.
        </EstadoVazio>
      ) : (
        <>
          <BarraMoedas c={c} f={f} parcela={parcela} mostradas={filtradas.length} />
          {filtradas.length === 0 ? <SemResultados aoLimpar={f.limpar} /> : null}
          {filtradas.length > 0 && visao === "tabela" ? (
            <TabelaMoedas
              moedas={filtradas}
              totais={totais}
              alocacaoTotal={alocacaoTotal}
              parcela={parcela}
              ordem={ordem}
              aoOrdenar={(o) =>
                f.mudar({ ordem: o.coluna === "alocacao" ? undefined : o.coluna, dir: o.direcao })
              }
              aoAbrir={aoAbrir}
            />
          ) : null}
          {filtradas.length > 0 && visao === "cartoes" ? (
            <CartoesMoedas moedas={filtradas} parcela={parcela} ordem={ordem} aoAbrir={aoAbrir} />
          ) : null}
          {filtradas.length > 0 && visao === "alocacao" ? (
            <Painel titulo="Alocação" id="titulo-alocacao">
              <GraficoAlocacao moedas={filtradas} />
              {recorte ? (
                <p className="apagado carteira-nota">
                  Fatias da conta inteira; as moedas fora do filtro não aparecem.
                </p>
              ) : null}
            </Painel>
          ) : null}
        </>
      )}
      <div className="grade-dupla carteira-grade">
        {c.moedas.length > 0 && visao !== "alocacao" ? (
          <Painel titulo="Alocação" id="titulo-alocacao">
            <GraficoAlocacao moedas={c.moedas} />
          </Painel>
        ) : null}
        <Painel titulo="Como estes números são calculados" id="titulo-como">
          <ComoCalculamos />
        </Painel>
      </div>
    </div>
  );
}

export function Carteira() {
  const f = useFiltrosUrl(buscaCarteira, NAO_CONTAM);
  const rede: RedeConta | undefined = f.busca.rede;
  const parcela: Parcela = f.busca.parcela ?? "total";
  const [aberta, setAberta] = useState<string | null>(null);
  const carteira = useCarteira(rede);
  const status = useStatusBinance();
  const c = carteira.data;
  const redeAtual = c?.rede ?? rede;
  return (
    <>
      <Cabecalho
        titulo="Carteira"
        acoes={c?.conectada ? <BotaoSincronizar rede={redeAtual ?? undefined} /> : null}
      >
        Tudo o que você tem na Binance: quanto investiu, quanto vale hoje, quanto rendeu e quanto pagou de
        taxa — do robô e o que você negociou à mão.
      </Cabecalho>
      {status.data?.contas.map((conta) => (
        <StatusChave key={conta.id} conta={conta} />
      ))}
      {carteira.isPending ? <Esqueleto altura={320} rotulo="Carregando a carteira" /> : null}
      {carteira.error ? (
        <ErroCarregar erro={carteira.error} tentarDeNovo={() => void carteira.refetch()} />
      ) : null}
      {c ? <Conteudo c={c} f={f} parcela={parcela} aoAbrir={setAberta} /> : null}
      <DetalheMoeda ativo={aberta} rede={redeAtual ?? undefined} aoFechar={() => setAberta(null)} />
    </>
  );
}
