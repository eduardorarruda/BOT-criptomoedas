import type { Corretora, PortaAgente } from "@zentrade/contratos";
import { ativosDoSimbolo, BinanceCorretora, PapelCorretora } from "@zentrade/corretora";
import { dec } from "@zentrade/dominio";
import type { Config } from "./config.js";
import { OPCOES_PADRAO, type Dependencias, type Registro } from "./nucleo/tipos.js";
import { CorretoraPapelAoVivo } from "./papel-ao-vivo.js";
import { AgenteFixo } from "./portas/agente-fixo.js";
import { AgenteHttp } from "./portas/agente-http.js";
import { EventosNoRegistro } from "./portas/eventos-registro.js";
import { AprovacaoMemoria, DecisoesMemoria, OrdensMemoria, RobosMemoria } from "./portas/memoria.js";
import type { RobosCarregados } from "./robos-arquivo.js";
import { dormirReal, RelogioSistema } from "./relogio.js";

const COTACAO_PAPEL = ativosDoSimbolo("BTCUSDT").cotacao;

export function criarCorretora(config: Config, registro: Registro): Corretora {
  const aoErroWebSocket = (erro: Error) => registro.warn({ erro }, "WebSocket da Binance com problema");
  if (config.MOTOR_REDE === "testnet")
    return new BinanceCorretora({
      rede: "testnet",
      apiKey: config.BINANCE_API_KEY,
      apiSecret: config.BINANCE_API_SECRET,
      taxaEstimada: config.BINANCE_TAXA_ESTIMADA,
      aoErroWebSocket,
    });
  // No papel, os dados de mercado são públicos: nenhuma chave é usada.
  const dados = new BinanceCorretora({ rede: config.MOTOR_PAPEL_DADOS, aoErroWebSocket });
  const papel = new PapelCorretora({
    saldos: { [COTACAO_PAPEL]: dec(config.MOTOR_PAPEL_SALDO) },
    taxa: config.MOTOR_PAPEL_TAXA,
    deslizamentoBps: config.MOTOR_PAPEL_DESLIZAMENTO_BPS,
  });
  return new CorretoraPapelAoVivo(dados, papel);
}

export function criarAgente(config: Config): PortaAgente {
  if (config.AGENTE_URL && config.AGENTE_SEGREDO)
    return new AgenteHttp({ url: config.AGENTE_URL, segredo: config.AGENTE_SEGREDO });
  return new AgenteFixo(config.MOTOR_AGENTE_FIXO);
}

/** Liga as peças. Portas em memória até o packages/banco existir. */
export function montarDependencias(config: Config, carregados: RobosCarregados, registro: Registro) {
  const relogio = new RelogioSistema();
  const robos = new RobosMemoria(carregados.robos);
  carregados.pausados.forEach((id) => robos.pausar(id));
  const deps: Dependencias = {
    corretora: criarCorretora(config, registro),
    robos,
    decisoes: new DecisoesMemoria(),
    ordens: new OrdensMemoria(relogio),
    agente: criarAgente(config),
    eventos: new EventosNoRegistro(registro),
    aprovacao: new AprovacaoMemoria((id) =>
      registro.warn({ decisaoId: id }, "aprovação pedida, mas ainda não há API para responder: vai expirar"),
    ),
    relogio,
    registro,
    dormir: dormirReal,
    opcoes: {
      ...OPCOES_PADRAO,
      agenteObrigatorio: config.MOTOR_AGENTE_OBRIGATORIO,
      tamanhoHistorico: config.MOTOR_HISTORICO,
    },
  };
  return { deps, robos };
}
