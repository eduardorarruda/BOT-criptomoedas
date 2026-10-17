import { Component, type ReactNode } from "react";

/**
 * Para extras que chegam sob demanda (a paleta de comandos, a ajuda de atalhos): se o
 * pedaço não carregar (ex.: a instância foi atualizada com a aba aberta), some em
 * silêncio em vez de derrubar a tela inteira. Recarregar a página resolve.
 */
export class SemQuebrar extends Component<{ readonly children: ReactNode }, { readonly falhou: boolean }> {
  override state = { falhou: false };

  static getDerivedStateFromError(): { falhou: boolean } {
    return { falhou: true };
  }

  override render(): ReactNode {
    return this.state.falhou ? null : this.props.children;
  }
}
