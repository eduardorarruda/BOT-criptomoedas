import {
  EstadoMt5Esquema,
  TesteMt5Esquema,
  type EstadoMt5,
  type NovasCredenciaisMt5,
  type TesteMt5,
} from "@zentrade/contratos/esquemas";
import { criarCliente, type ClienteApi } from "../../api/cliente";

export interface ApiMt5 {
  estado(): Promise<EstadoMt5>;
  /** A senha só vai; nunca volta. Pede identidade confirmada (a tela envolve em `comConfirmacao`). */
  salvar(c: NovasCredenciaisMt5): Promise<EstadoMt5>;
  remover(): Promise<void>;
  testar(): Promise<TesteMt5>;
}

export function criarApiMt5(cliente: ClienteApi = criarCliente()): ApiMt5 {
  const { pedir } = cliente;
  return {
    estado: () => pedir("GET", "/dados-mt5", EstadoMt5Esquema),
    salvar: (c) => pedir("PUT", "/dados-mt5", EstadoMt5Esquema, c),
    remover: async () => {
      await pedir("DELETE", "/dados-mt5", null);
    },
    testar: () => pedir("POST", "/dados-mt5/testar", TesteMt5Esquema),
  };
}
