# O que é o Jev e como usá-lo com segurança

Resumo: o Jev é um modelo de IA que responde perguntas fechadas com probabilidades, em menos de um segundo; serve como classificador, não como previsor de mercado.

Informação de outubro de 2026 (modelo em acesso antecipado; detalhes podem mudar). Não é recomendação de investimento.

## O que é

- Modelo da **TypeSafe AI**, lançado em acesso antecipado em 15/9/2026. A empresa chama de "System One": decisões rápidas e estruturadas, em oposição ao raciocínio lento de modelos de linguagem.
- É **discriminativo**: em vez de escrever texto, escolhe entre opções que você define e devolve a **probabilidade** de cada uma e uma **confiança**.
- Treinado **só com dados sintéticos**, por um método não publicado (RLCD). Arquitetura e pesos não foram publicados.
- **Proprietário e só por API.** Não há ajuste fino por conta.
- Latência declarada: **70 a 500 ms** por chamada, mais a rede. Preço: **US$ 0,042 por milhão de tokens de entrada**; saída grátis.

## Como funciona uma chamada

- Você envia um **`state`** (o contexto, de preferência um objeto JSON com nomes claros) e um conjunto de **perguntas**.
- Três tipos de pergunta:
  - **noul:** sim ou não; volta a probabilidade de "sim";
  - **choice:** uma opção entre várias; volta a escolha, a distribuição e a confiança;
  - **score:** um nível numa escala ordenada.
- Todas as perguntas veem o mesmo `state` e são respondidas em paralelo; uma não depende da outra.
- Limite: 64 mil tokens por chamada, 32 mil para o `state` mais a maior pergunta.
- Versões: `jev-1.13.0` (estável) e `jev-1.14.0` (prévia). Para decisões auditáveis, fixa-se a versão exata.

## O que ele não faz bem (segundo a própria TypeSafe)

- **Conta e contagem:** "não é uma calculadora".
- **Datas:** trata datas como texto; comparar e somar tempo é fraco.
- **Precisão numérica** e perguntas que exigem várias etapas.
- **Contexto grande e irrelevante:** informação a mais distrai e piora a resposta.
- **Conteúdo adversário:** não se defende de texto que tenta dar instruções (injeção).
- **Instruções contraditórias** e **ordem das opções** influenciam a resposta.
- **Línguas além do inglês** têm precisão menor.
- **Não gera explicação.** Não serve para justificar uma decisão em texto.

Regra que sai disso: **toda conta fica no código**. O `state` leva números já calculados e, junto, rótulos ("longe", "perto", "alto", "normal").

## O que significa "calibrado" aqui

- A TypeSafe treina o Jev para que as probabilidades reflitam a incerteza **nos dados de treino dela**, que são sintéticos.
- A própria documentação não garante calibração no domínio de cada cliente e recomenda testar com os próprios dados e começar com limites conservadores.
- Num mercado, isso quer dizer: uma probabilidade de 0,8 do Jev **não é** 80% de chance de o alvo bater. Só medindo nas decisões reais (curva de confiabilidade, Brier, erro de calibração) se sabe quanto ela vale.

## Usos que fazem sentido num robô

- **Classificar o regime** do pregão (tendência, lateral, volátil, anormal).
- **Vetar** em condição anormal (dado atrasado, livro raso, leilão, evento próximo). Veto só reduz risco.
- **Filtrar sinais** das regras: a probabilidade entra como variável num modelo nosso, medido e recalibrado.
- **Triar notícias** antes de indexar na base de conhecimento, tratando a saída só como rótulo.

## Usos que não fazem sentido

- Prever o próximo movimento do preço.
- Decidir tamanho, stop ou limites de risco.
- Substituir o motor de risco ou o botão de parada.
- Operar por tick competindo com operadores de alta frequência.

## Uso seguro, em resumo

1. O Jev responde perguntas; o código decide.
2. Versão fixa, timeout curto, e "sem resposta = não operar".
3. `state` enxuto, sem dado pessoal, com números já calculados.
4. Notícia entra como manchete e rótulo, nunca como instrução.
5. Medir a calibração fora da amostra e comparar com um modelo simples (regressão logística) antes de dar qualquer peso ao Jev.
6. Dependência de fornecedor: se a API mudar ou cair, o robô continua seguro porque o pior caso é não operar.

## Fonte(s)

- Wikipedia — [Jev (AI model)](<https://en.wikipedia.org/wiki/Jev_(AI_model)>)
- TypeSafe — [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- TypeSafe docs — [System One](https://docs.typesafe.ai/concepts/system-one), [Primitives](https://docs.typesafe.ai/primitives), [State](https://docs.typesafe.ai/concepts/state), [Confidence](https://docs.typesafe.ai/confidence), [Models](https://docs.typesafe.ai/models), [API](https://docs.typesafe.ai/api), [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md), [How to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)
- TechCrunch — [A new kind of AI model from a ChatGPT inventor](https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/)
- The Register — [TypeSafe AI debuts model for machines](https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/5296711)
