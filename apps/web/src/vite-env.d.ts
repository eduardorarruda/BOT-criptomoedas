/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" liga o modo de demonstração (dados fictícios, sem API). */
  readonly VITE_DEMO?: string;
  /** "1" deixa buscadores indexarem as páginas públicas (exige VITE_URL_PUBLICA). */
  readonly VITE_PUBLICO?: string;
  /** Endereço público da instância (https://…), para canônico, sitemap e imagem social. */
  readonly VITE_URL_PUBLICA?: string;
}

/** Versão do pacote da tela, injetada pelo Vite (vite.config.ts). */
declare const __ZENTRADE_VERSAO__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
