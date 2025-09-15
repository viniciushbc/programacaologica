# Programação Lógica — Conversões e Renderização (LaTeX → PCNF/PDNF/Cláusulas/Horn)

Aplicação web (HTML/CSS/JS puro) que:

* **renderiza** fórmulas de Lógica (em LaTeX) com **MathJax**;
* **transforma passo a passo** para:

  * **PCNF** – Forma Normal Conjuntiva Prenex;
  * **PDNF** – Forma Normal Disjuntiva Prenex;
  * **Forma Cláusal** (Skolemização + CNF + extração de cláusulas);
  * **Relatório de Horn** (verifica se cada cláusula tem ≤ 1 literal positivo).

Projeto desenvolvido por **Davi Marques Caldeira** e **Vinícius Henrique Budag Coelho**,
4º período de **Bacharelado em Ciência da Computação**, na disciplina de **Programação Lógica e Funcional**.

---

## 🔎 Demonstração rápida

Abra `index.html` no navegador, digite uma FBF em LaTeX e selecione o painel desejado:

* **Exemplos de fórmulas**

  ```
  \forall z ( R(z) \leftrightarrow \neg \exists x P(f(z), x) )

  \neg P(a, f(b), c)

  P(x) \lor \forall y Q(y)
  ```

A pré-visualização e os passos são tipografados via MathJax.
O botão **Limpar** zera a entrada e os resultados.

---

## 🧩 Funcionalidades

* **Preview LaTeX** com MathJax v3 (CDN).
* **Parser e transformações em JS puro** (sem bibliotecas de lógica).
* **Passo a passo** em quatro painéis (PCNF, PDNF, Cláusal, Horn).
* **Skolemização** com geração de constantes `sk_c*` e funções `sk_f*`.
* **Relatório de Horn**: indica se é Horn e quais cláusulas violam a regra.

---

## ✅ Sintaxe aceita (tolerante)

O analisador léxico é robusto e aceita:

* Quantificadores: `\forall`, `∀`, `\exists`, `∃`
  (pode usar **lista**: `\forall x,y,z.` ou `\forall x,y: ...`)
* Conectivos:
  `\neg`, `\lnot`, `¬`, `~` • `\land`, `∧` • `\lor`, `∨` •
  `\rightarrow`, `→`, `\Rightarrow`, `⇒`, `->` •
  `\leftrightarrow`, `↔`, `\Leftrightarrow`, `⇔`, `<->`
* Igualdade e desigualdade: `=`, `\neq`, `≠`
* Parênteses: `()`, `[]`, `{}` e também `\left( ... \right)`
* Espaços TeX ignorados: `\, \; \: \!`, `\quad`, `\qquad`
* Funções e predicados: `f(x,y)`, `P(x)`, `R(a)`, `G(h(f(x)))` etc.

> **Observação:** o parser não faz raciocínio com igualdade (apenas trata `=`/`≠` como literais).
> Para distribuição/simplificação usa regras sintáticas clássicas; o objetivo é **didático**.

---

## 🛠️ Como rodar

### Opção 1 — Abrir direto

1. Baixe/clonar este repositório.
2. Abra `index.html` em um navegador moderno (Chrome/Firefox/Edge).

> Usa MathJax via CDN; conexão à internet é necessária na primeira carga.

### Opção 2 — Servidor local (recomendado)

Use qualquer servidor estático (ex.: **Live Server** no VS Code).

---

## 📁 Estrutura

```
/
├─ index.html        # página principal (entrada e painéis de passos)
├─ sobre.html        # página "Sobre"
├─ style.css         # estilos (padrão visual unificado)
├─ script.js         # parser + transformações + renderização dos passos
└─ README.md
```

* **index.html**

  * Barra de entrada + botões dos painéis.
  * Links de navegação: **Sobre** (pílula pêssego) e **Introdução à Programação Lógica** (amarelo).
* **sobre.html**

  * Informações do projeto e link de volta para a index.
* **style.css**

  * Paleta suave; pills; caixas; painéis.
  * Classes de navegação:

    * `.nav-push` → empurra o “Sobre” para a direita (grande espaço).
    * `.about-btn` → cor pêssego do botão “Sobre”.
    * `.intro-btn` → botão amarelo (link externo).
* **script.js** (principais funções)

  * `mjxRender` — garante que o MathJax esteja pronto antes de tipografar.
  * **Pipeline**: `elimImpIff` → `toNNF` → `standardizeApart` → `toPrenex` →
    `toCNFMatrix` / `toDNFMatrix` → `skolemize` → `clausesFromCNF` → `hornReport`.
  * **Parser**:

    * `tokenize`, `parse` (com suporte a listas de quantificadores e \left/\right).
  * **Render**:

    * `runPipelineAndRenderAllSafe` preenche cada passo e tipografa.

---

## 🧮 O que cada painel mostra

### PCNF (Forma Normal Conjuntiva Prenex)

1. Fórmula original
2. Eliminação de `→` e `↔`
3. NNF (negações empurradas)
4. *Standardize apart* (renomeia variáveis ligadas)
5. **Prenex** (todos os quantificadores no prefixo)
6. **CNF** da matriz (distribui `∨` sobre `∧`) + prefixo = **PCNF**

### PDNF (Forma Normal Disjuntiva Prenex)

Mesmos passos até o 5; no 6 distribui `∧` sobre `∨` para obter **DNF** da matriz.

### Forma Cláusal

1–5: mesmos passos (termina em Prenex)
6\. **Skolemização** (remove `∃` criando `sk_f*`/`sk_c*`) + **remoção de `∀`**
7\. **CNF da matriz skolemizada** + **extração de cláusulas** (lista numerada)

### Cláusulas de Horn

1. Repete a lista de cláusulas
2. **Relatório**: SIM se todas têm ≤ 1 literal positivo; senão, lista as violadoras.

---

## 🧪 Exemplos prontos para testar

Cole um de cada vez no campo:

```
\forall z ( R(z) \leftrightarrow \neg \exists x P(f(z), x) )
```

```
\neg P(a, f(b), c)
```

```
P(x) \lor \forall y Q(y)
```

```
\forall x,y ( (P(x) \rightarrow Q(y)) \leftrightarrow \exists z R(f(x),y,z) )
```

```
\exists x ( P(x) \land \forall y (Q(y) \rightarrow \neg R(x,y)) )
```

---

## 🧷 Dicas e solução de problemas

* **Nada aparece tipografado?**
  O projeto já espera o MathJax ficar pronto (`mjxRender`). Recarregue a página se a rede estiver lenta.
* **“Token inválido”**

  * Confira parênteses e vírgulas em funções/predicados: `P(x,y)`, `f(x)`.
  * Evite comandos LaTeX fora dos suportados (como `\frac`, `\sum`, etc.).
  * Use conectivos aceitos (lista na seção **Sintaxe**).
  * Se precisar ampliar o suporte, edite o mapa `kwMap` e, se necessário, as regras no `parse`.

---

## 🧱 Limitações (escopo didático)

* Não faz **raciocínio** com igualdade (apenas trata `=`/`≠` como literais).
* Não realiza **simplificações profundas** (ex.: remoção de tautologias/contradições).
* Distribuição para CNF/DNF é sintática; fórmulas muito grandes podem crescer bastante.

---

## 🌐 Deploy (opcional)

* **GitHub Pages**: faça push do repositório e ative Pages (branch `main`, pasta `/`).
* **Netlify/Vercel**: arraste a pasta ou conecte o repositório; é site estático.

---

## 🤝 Créditos

* **Alunos**: Davi Marques Caldeira e Vinícius Henrique Budag Coelho
* **Disciplina**: Programação Lógica e Funcional
* **Professor**: Frank Coelho de Alcântara
* **Renderização**: [MathJax v3](https://www.mathjax.org/)

---

## 📜 Licença

Uso **acadêmico/educacional**. Sinta-se à vontade para reutilizar com créditos aos autores.