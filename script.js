/* =========================================================================
   script.js (versão em português)
   - Nomes de variáveis e funções em PT-BR
   - Comentários explicando cada etapa
   - Mesma funcionalidade do original
   ========================================================================*/

/* -------------------------------------------------------------------------
   MathJax — garantir que a engine esteja pronta antes de tipografar
   -------------------------------------------------------------------------*/
/**
 * Tipografa (renderiza) fórmulas LaTeX com o MathJax, garantindo que a
 * biblioteca já terminou de carregar. Aceita um elemento ou uma lista deles.
 */
async function renderizarMJX(nos) {
  const lista = (Array.isArray(nos) ? nos : [nos]).filter(Boolean);

  // Aguarda o carregamento do MathJax (quando o script ainda está iniciando)
  if (!window.MathJax?.typesetPromise) {
    await new Promise((resolver) => {
      let finalizado = false;
      const concluir = () => { if (!finalizado) { finalizado = true; resolver(); } };

      // Tenta novamente quando a página terminar de carregar
      window.addEventListener('load', () => {
        if (window.MathJax?.typesetPromise) concluir();
        else setTimeout(concluir, 0);
      }, { once: true });

      // Polling leve enquanto não chega no onload (evita travar)
      const id = setInterval(() => {
        if (window.MathJax?.typesetPromise) { clearInterval(id); concluir(); }
      }, 50);

      // Timeout de segurança (2s) — segue em frente mesmo sem typesetPromise
      setTimeout(() => { clearInterval(id); concluir(); }, 2000);
    });
  }

  try {
    // Garante que a inicialização do MathJax terminou
    if (window.MathJax?.startup?.promise) await MathJax.startup.promise;

    // Tipografa os nós solicitados
    if (window.MathJax?.typesetPromise) {
      await MathJax.typesetPromise(lista);
    }
  } catch (erro) {
    console.warn('MathJax ainda não pôde tipografar:', erro);
  }
}

/* -------------------------------------------------------------------------
   Utilidades de UI
   -------------------------------------------------------------------------*/
/**
 * adiar(fn, atraso) — "debounce":
 * Retorna uma função que só executa `fn` quando o usuário parar de chamar
 * por `atraso` ms (útil para não renderizar a cada tecla digitada).
 */
function adiar(fn, atraso = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), atraso);
  };
}

/** Atalho para querySelector. */
const selecionar = (seletor) => document.querySelector(seletor);

/* -------------------------------------------------------------------------
   Referências aos elementos do DOM
   -------------------------------------------------------------------------*/
const entrada      = selecionar("#latexInput");
const saida        = selecionar("#output");
const caixaStatus  = selecionar("#status");
const botaoRender  = selecionar("#renderBtn"); // pode não existir no HTML atual
const botaoLimpar  = selecionar("#clearBtn");

/* -------------------------------------------------------------------------
   Pré-visualização com MathJax
   -------------------------------------------------------------------------*/
/** Envolve o LaTeX com delimitadores de exibição, se o usuário não usou. */
function envolverLatex(texto) {
  const s = texto.trim();
  const comDisplay = s.startsWith("$$") || s.startsWith("\\[");
  const comInline  = s.startsWith("$")  || s.startsWith("\\(");
  if (comDisplay || comInline) return s;
  return `$$\n${s}\n$$`;
}

/**
 * Renderiza a pré-visualização e dispara o pipeline de transformações.
 * - Mostra o LaTeX bruto, envolve com delimitadores, tipografa com MathJax.
 * - Em seguida, alimenta os painéis (PCNF/PDNF/Cláusal/Horn).
 */
async function renderizar() {
  try {
    const fonte = (entrada?.value || "").trim();

    // Se o campo estiver vazio, limpe a UI e saia
    if (!fonte) {
      if (saida) saida.innerHTML = "";
      if (caixaStatus) { caixaStatus.textContent = ""; caixaStatus.className = "status"; }
      limparPaineis();
      return;
    }

    // Mostra o LaTeX digitado e, depois, o mesmo LaTeX com delimitadores
    saida.textContent = fonte;
    saida.innerHTML = envolverLatex(fonte);

    // Tipografa a prévia
    await renderizarMJX([saida]);

    // Marca status
    if (caixaStatus) { caixaStatus.textContent = "Renderizado"; caixaStatus.className = "status ok"; }

    // Executa o pipeline e preenche os painéis
    await executarPipelineERenderizar(fonte);

  } catch (erro) {
    if (caixaStatus) { caixaStatus.textContent = "Erro ao renderizar."; caixaStatus.className = "status err"; }
    console.error(erro);
  }
}

// Pré-visualização em tempo real (com debounce)
const renderizarAoVivo = adiar(renderizar, 300);
if (entrada)     entrada.addEventListener("input", renderizarAoVivo);
if (botaoRender) botaoRender.addEventListener("click", renderizar);
if (botaoLimpar) {
  botaoLimpar.addEventListener("click", () => {
    if (entrada) entrada.value = "";
    if (saida)   saida.innerHTML = "";
    if (caixaStatus) { caixaStatus.textContent = ""; caixaStatus.className = "status"; }
    limparPaineis();
  });
}
// Render inicial (útil quando há conteúdo pré-carregado)
document.addEventListener("DOMContentLoaded", renderizar);

/* -------------------------------------------------------------------------
   Alternância (tabs) dos painéis
   -------------------------------------------------------------------------*/
document.addEventListener("click", (evento) => {
  const botao = evento.target.closest(".pill");
  if (!botao) return;

  const seletorAlvo = botao.getAttribute("data-target");
  const painelAlvo  = document.querySelector(seletorAlvo);
  if (!painelAlvo) return;

  // Esconde todos e mostra apenas o painel escolhido
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  painelAlvo.classList.remove("hidden");

  // Marca visualmente o botão ativo
  document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
  botao.classList.add("active");

  // Rola suavemente até o painel
  painelAlvo.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* -------------------------------------------------------------------------
   Helpers dos painéis (o que é tipografado em LaTeX x o que é texto)
   -------------------------------------------------------------------------*/
const alvosMJX = [
  '#pcnf-original','#pcnf-noimp','#pcnf-nnf','#pcnf-std','#pcnf-prenex','#pcnf-final',
  '#pdnf-original','#pdnf-noimp','#pdnf-nnf','#pdnf-std','#pdnf-prenex','#pdnf-final',
  '#claus-original','#claus-noimp','#claus-nnf','#claus-std','#claus-prenex'
];
const alvosCodigo = ['#claus-skolem','#claus-final','#horn-clauses','#horn-report'];

/** Limpa todas as caixas dos painéis (sempre antes de preencher de novo). */
function limparPaineis() {
  alvosMJX.forEach(sel => { const el = document.querySelector(sel);  if (el) el.innerHTML = ''; });
  alvosCodigo.forEach(sel => { const el = document.querySelector(sel); if (el) el.innerHTML = ''; });
}

/** Injeta LaTeX (será tipografado depois) em um seletor específico. */
function definirLatex(seletor, latex) {
  const el = document.querySelector(seletor);
  if (!el) return;
  el.innerHTML = `$$${latex}$$`;
}

/** Escapa HTML para exibir texto literalmente (em <pre>). */
function escaparHTML(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/** Injeta texto em formato de código (com quebras preservadas) em um seletor. */
function definirCodigo(seletor, texto) {
  const el = document.querySelector(seletor);
  if (!el) return;
  el.innerHTML = `<pre style="white-space:pre-wrap;margin:0">${escaparHTML(texto)}</pre>`;
}

/* =========================================================================
   MÓDULO DE LÓGICA — Parser e transformações (JS puro)
   =========================================================================*/
(function() {
  const clonar = (obj) => JSON.parse(JSON.stringify(obj));

  /* ---------------------------- Tokenização ---------------------------- */
  /**
   * Converte a entrada em uma lista de tokens. É tolerante a variações
   * de LaTeX (\forall/∀, \exists/∃, \neg/¬/~, \land/∧, \lor/∨, ->, → etc.)
   * e ignora comandos visuais (\left, \right, \quad, \text{...}, etc.).
   */
  function tokenizar(entrada) {
    let s = entrada.trim();
    const tokens = [];
    let i = 0;

    // Palavras-chave e símbolos reconhecidos
    const mapaKW = {
      "\\forall":"FORALL","∀":"FORALL",
      "\\exists":"EXISTS","∃":"EXISTS",
      "\\neg":"NOT","\\lnot":"NOT","¬":"NOT","~":"NOT",
      "\\land":"AND","\\wedge":"AND","∧":"AND",
      "\\lor":"OR","\\vee":"OR","∨":"OR",
      "\\rightarrow":"IMP","\\to":"IMP","->":"IMP","⇒":"IMP","\\Rightarrow":"IMP","→":"IMP",
      "\\leftrightarrow":"IFF","\\iff":"IFF","<->":"IFF","⇔":"IFF","\\Leftrightarrow":"IFF","↔":"IFF",
      "=":"EQ","\\neq":"NEQ","\\ne":"NEQ","≠":"NEQ",
    };

    // Comandos puramente visuais/pontuação que podem ser ignorados
    const comandosPontuacao = new Set(["\\,", "\\;", "\\:", "\\!"]);
    const comandosVisuais   = new Set([
      "left","right","big","Big","bigg","Bigg","quad","qquad",
      "enspace","hspace","vspace","text","mathrm","operatorname",
      "mathbf","mathit","mathsf","mathtt","color"
    ]);

    // Consome um grupo {...} equilibrado (usado para \text{...}, \color{...} etc.)
    function pularGrupoBalanceado(ind) {
      while (ind < s.length && s[ind] !== '{') ind++;
      if (ind >= s.length) return ind;
      let profundidade = 0;
      while (ind < s.length) {
        const c = s[ind++];
        if (c === '{') profundidade++;
        else if (c === '}') { profundidade--; if (profundidade === 0) break; }
      }
      return ind;
    }

    // Tenta casar alguma palavra-chave do mapaKW a partir da posição atual
    function casarPalavraChave() {
      for (const [k, v] of Object.entries(mapaKW)) {
        if (s.startsWith(k, i)) { i += k.length; return { type: v }; }
      }
      return null;
    }

    while (i < s.length) {
      const c = s[i];

      // Comentários de LaTeX (% ... até o fim da linha)
      if (c === '%') { while (i < s.length && s[i] !== '\n') i++; continue; }

      // Espaços
      if (/\s/.test(c)) { i++; continue; }

      // Parênteses / Colchetes / Chaves — tratamos todos como LP/RP
      if (c === '(' || c === '[' || c === '{') { tokens.push({ type: 'LP' }); i++; continue; }
      if (c === ')' || c === ']' || c === '}') { tokens.push({ type: 'RP' }); i++; continue; }

      // Vírgulas e separadores
      if (c === ',') { tokens.push({ type: 'COMMA' }); i++; continue; }
      if (c === '.' || c === ':') { tokens.push({ type: 'DOT' }); i++; continue; }

      // Atalhos de implicação / bi-implicação
      if (s.startsWith('->', i))  { tokens.push({ type: 'IMP' }); i += 2; continue; }
      if (s.startsWith('<->', i)) { tokens.push({ type: 'IFF' }); i += 3; continue; }

      // Comandos de pontuação (\,, \;, \:, \!) — ignorar
      const dois = s.slice(i, i + 2);
      if (comandosPontuacao.has(dois)) { i += 2; continue; }

      // Comandos que começam com "\" (ex.: \forall, \neg, \left, \text, ...)
      if (s[i] === '\\') {
        const kw = casarPalavraChave();
        if (kw) { tokens.push(kw); continue; }

        // Nome do comando (\left, \text, \color, ...)
        let j = i + 1;
        while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        const comando = s.slice(i + 1, j);

        // Se for um comando visual, pula opcionalmente o grupo {...}
        if (comandosVisuais.has(comando)) {
          i = j;
          if (s[i] === '{') i = pularGrupoBalanceado(i);
          continue;
        }

        throw new Error(`Token inválido (comando \\${comando})`);
      }

      // Tenta novamente casar palavras-chave de 1 char (ex.: "∀", "∧", "↔")
      const kw2 = casarPalavraChave();
      if (kw2) { tokens.push(kw2); continue; }

      // Identificadores (predicados, funções, variáveis): P, Q, f, x1, y2, foo, etc.
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_\u00C0-\u017F]/.test(s[j])) j++;
        tokens.push({ type: 'ID', value: s.slice(i, j) });
        i = j;
        continue;
      }

      // Se nada casou, reporta onde travou (útil para depurar)
      throw new Error(`Token inválido em "${s.slice(i, i + 12)}"`);
    }

    return tokens;
  }

  /* ------------------------------- Parser ------------------------------ */
  /**
   * Gramática descendente recursiva:
   *  - parseIff -> parseImp <-> parseImp ...
   *  - parseImp -> parseOr  -> parseAnd -> parseUnary -> parsePrimary
   *  - Suporta listas em quantificadores: \forall x,y,z. ...
   *  - Trata igualdade (=) e desigualdade (≠) como literais.
   */
  function analisar(entrada) {
    const toks = tokenizar(entrada);
    let pos = 0;

    const ver = () => toks[pos] || { type: 'EOF' };
    const comer = (t) => { const x = ver(); if (x.type !== t) throw new Error(`Esperado ${t}, obtido ${x.type}`); pos++; return x; };
    const tentarComer = (t) => (ver().type === t ? (pos++, true) : false);

    // Termo: id | id(termo, termo, ...)
    function analisarTermo() {
      const id = comer('ID').value;
      if (tentarComer('LP')) {
        const args = [];
        if (ver().type !== 'RP') {
          args.push(analisarTermo());
          while (tentarComer('COMMA')) args.push(analisarTermo());
        }
        comer('RP');
        return { kind: 'func', name: id, args };
      }
      return { kind: 'sym', name: id };
    }

    // Tenta analisar uma igualdade/desigualdade: termo (=|≠) termo
    function tentarAnalisarIgualdade() {
      const salvo = pos;
      try {
        if (ver().type !== 'ID' && ver().type !== 'LP') return null;
        if (ver().type === 'LP') return null; // evita conflitos com "( ... )"
        const esquerdo = analisarTermo();
        const op = ver().type;
        if (op !== 'EQ' && op !== 'NEQ') { pos = salvo; return null; }
        pos++;
        const direito = analisarTermo();
        return { type: op === 'EQ' ? 'eq' : 'neq', left: esquerdo, right: direito };
      } catch { pos = salvo; return null; }
    }

    // Predicado: Nome(args?)
    function analisarAtomo() {
      const nome = comer('ID').value;
      let args = [];
      if (tentarComer('LP')) {
        if (ver().type !== 'RP') {
          args.push(analisarTermo());
          while (tentarComer('COMMA')) args.push(analisarTermo());
        }
        comer('RP');
      }
      return { type: 'pred', name: nome, args };
    }

    function analisarPrimario() {
      const t = ver();

      // ( ... )
      if (t.type === 'LP') { comer('LP'); const f = analisarIff(); comer('RP'); return f; }

      // Quantificadores: \forall x,y.  ... ou \exists x ...
      if (t.type === 'FORALL' || t.type === 'EXISTS') {
        const q = t.type === 'FORALL' ? 'forall' : 'exists'; pos++;
        const vars = [];
        vars.push(comer('ID').value);
        while (tentarComer('COMMA')) vars.push(comer('ID').value);
        tentarComer('DOT'); // aceita "." ou ":" como separador

        let corpo;
        if (ver().type === 'LP') { comer('LP'); corpo = analisarIff(); comer('RP'); }
        else { corpo = analisarUnario(); }

        // Expande lista de variáveis em quantificadores aninhados (direita->esquerda)
        return vars.reverse().reduce((acc, v) => ({ type: q, v, body: acc }), corpo);
      }

      // Negação
      if (t.type === 'NOT') { comer('NOT'); const sub = analisarUnario(); return { type: 'not', sub }; }

      // Igualdade/Desigualdade?
      const eq = tentarAnalisarIgualdade();
      if (eq) return eq;

      // Predicado simples
      if (t.type === 'ID') return analisarAtomo();

      throw new Error(`Símbolo inesperado: ${t.type}`);
    }

    function analisarUnario() { return analisarPrimario(); }

    // Ajuda para operadores associativos à esquerda (AND, OR, IMP, IFF)
    function associarEsquerda(analisarMenor, ops) {
      let no = analisarMenor();
      while (ops.has(ver().type)) {
        const t = ver().type; pos++;
        const direito = analisarMenor();
        const mapa = { AND: 'and', OR: 'or', IMP: 'imp', IFF: 'iff' };
        no = { type: mapa[t], left: no, right: direito };
      }
      return no;
    }

    const analisarAnd = () => associarEsquerda(analisarUnario, new Set(['AND']));
    const analisarOr  = () => associarEsquerda(analisarAnd , new Set(['OR']));
    const analisarImp = () => associarEsquerda(analisarOr  , new Set(['IMP']));
    const analisarIff = () => associarEsquerda(analisarImp , new Set(['IFF']));

    const ast = analisarIff();
    if (ver().type !== 'EOF') throw new Error("Sobrou entrada após o parse.");
    return ast;
  }

  /* ----------------------- Impressão em LaTeX ------------------------- */
  function termoParaLatex(t) {
    if (t.kind === 'func') return `${t.name}\\left(${t.args.map(termoParaLatex).join(',\\,')}\\right)`;
    return t.name;
  }
  function formulaParaLatex(n) {
    switch (n.type) {
      case 'pred': {
        const args = n.args?.length ? `\\left(${n.args.map(termoParaLatex).join(',\\,')}\\right)` : '';
        return `${n.name}${args}`;
      }
      case 'eq':  return `${termoParaLatex(n.left)}\\,=\\,${termoParaLatex(n.right)}`;
      case 'neq': return `${termoParaLatex(n.left)}\\,\\ne\\,${termoParaLatex(n.right)}`;
      case 'not': {
        const interno = (n.sub.type === 'pred' || n.sub.type === 'eq' || n.sub.type === 'neq')
          ? formulaParaLatex(n.sub)
          : `\\left(${formulaParaLatex(n.sub)}\\right)`;
        return `\\neg ${interno}`;
      }
      case 'and':
      case 'or':
      case 'imp':
      case 'iff': {
        const op = { and: '\\land', or: '\\lor', imp: '\\rightarrow', iff: '\\leftrightarrow' }[n.type];
        const L = (['pred','not','eq','neq'].includes(n.left.type))  ? formulaParaLatex(n.left)  : `\\left(${formulaParaLatex(n.left)}\\right)`;
        const R = (['pred','not','eq','neq'].includes(n.right.type)) ? formulaParaLatex(n.right) : `\\left(${formulaParaLatex(n.right)}\\right)`;
        return `${L}\\;${op}\\;${R}`;
      }
      case 'forall':
      case 'exists': {
        const q = n.type === 'forall' ? '\\forall' : '\\exists';
        const corpo = (['pred','not','eq','neq'].includes(n.body.type))
          ? formulaParaLatex(n.body) : `\\left(${formulaParaLatex(n.body)}\\right)`;
        return `${q}\\, ${n.v}\\, ${corpo}`;
      }
      default: return '?';
    }
  }

  /* ---------------------- Transformações lógicas ---------------------- */
  /** Elimina → e ↔ (ficam só ¬, ∧, ∨, quantificadores). */
  function eliminarImpEbi(n) {
    n = clonar(n);
    function ir(x) {
      switch (x.type) {
        case 'iff': {
          const A = ir(x.left), B = ir(x.right);
          return {
            type: 'and',
            left:  { type: 'or', left: { type: 'not', sub: A }, right: B },
            right: { type: 'or', left: { type: 'not', sub: B }, right: A }
          };
        }
        case 'imp': {
          const A = ir(x.left), B = ir(x.right);
          return { type: 'or', left: { type: 'not', sub: A }, right: B };
        }
        case 'and': return { type: 'and', left: ir(x.left), right: ir(x.right) };
        case 'or' : return { type: 'or' , left: ir(x.left), right: ir(x.right) };
        case 'not': return { type: 'not', sub: ir(x.sub) };
        case 'forall': return { type: 'forall', v: x.v, body: ir(x.body) };
        case 'exists': return { type: 'exists', v: x.v, body: ir(x.body) };
        default: return x;
      }
    }
    return ir(n);
  }

  /** Converte para NNF (negações empurradas até os átomos). */
  function paraNNF(n) {
    function negar(x) {
      switch (x.type) {
        case 'not': return paraNNF(x.sub);
        case 'and': return { type: 'or',  left: negar(x.left),  right: negar(x.right) };
        case 'or' : return { type: 'and', left: negar(x.left),  right: negar(x.right) };
        case 'forall': return { type: 'exists', v: x.v, body: negar(x.body) };
        case 'exists': return { type: 'forall', v: x.v, body: negar(x.body) };
        case 'pred':
        case 'eq':
        case 'neq': return { type: 'not', sub: x };
        default:     return { type: 'not', sub: paraNNF(x) };
      }
    }
    switch (n.type) {
      case 'not': return negar(n.sub);
      case 'and': return { type: 'and', left: paraNNF(n.left), right: paraNNF(n.right) };
      case 'or' : return { type: 'or' , left: paraNNF(n.left), right: paraNNF(n.right) };
      case 'forall': return { type: 'forall', v: n.v, body: paraNNF(n.body) };
      case 'exists': return { type: 'exists', v: n.v, body: paraNNF(n.body) };
      default: return n;
    }
  }

  /** Gera nome de variável fresca que não conflita com as já usadas. */
  function nomeUnico(base, usados){
    let i = 1, n = (base || 'x');
    while (usados.has(n)) n = `${base}${i++}`;
    usados.add(n);
    return n;
  }

  /** Renomeia variáveis ligadas para evitar colisões (standardize apart). */
  function padronizarVariaveis(n) {
    const usados = new Set();

    // Coleta nomes já usados (variáveis e símbolos em termos)
    (function coletar(x) {
      switch (x.type) {
        case 'pred': x.args.forEach(visitarTermo); break;
        case 'eq'  : visitarTermo(x.left); visitarTermo(x.right); break;
        case 'neq' : visitarTermo(x.left); visitarTermo(x.right); break;
        case 'not' : coletar(x.sub); break;
        case 'and' :
        case 'or'  : coletar(x.left); coletar(x.right); break;
        case 'forall':
        case 'exists': usados.add(x.v); coletar(x.body); break;
      }
    })(n);

    function visitarTermo(t){ if (t.kind==='func') t.args.forEach(visitarTermo); else usados.add(t.name); }

    function substituirTermo(t,env){
      if (t.kind==='func') return {kind:'func',name:t.name,args:t.args.map(a=>substituirTermo(a,env))};
      return {kind:t.kind,name:env.get(t.name)||t.name};
    }

    function ir(x, env) {
      switch (x.type) {
        case 'pred': return { type: 'pred', name: x.name, args: x.args.map(a=>substituirTermo(a,env)) };
        case 'eq'  : return { type: 'eq' , left: substituirTermo(x.left,env), right: substituirTermo(x.right,env) };
        case 'neq' : return { type: 'neq', left: substituirTermo(x.left,env), right: substituirTermo(x.right,env) };
        case 'not' : return { type: 'not', sub: ir(x.sub, env) };
        case 'and' : return { type: 'and', left: ir(x.left,env), right: ir(x.right,env) };
        case 'or'  : return { type: 'or' , left: ir(x.left,env), right: ir(x.right,env) };
        case 'forall':
        case 'exists': {
          const fresco = nomeUnico(x.v.replace(/[^a-z]/gi,'')||'x', usados);
          const env2 = new Map(env); env2.set(x.v, fresco);
          return { type: x.type, v: fresco, body: ir(x.body, env2) };
        }
        default: return x;
      }
    }
    return ir(n, new Map());
  }

  /** Move todos os quantificadores para o prefixo (prenexação). */
  function paraPrenex(n) {
    function puxar(x) {
      switch (x.type) {
        case 'forall': { const p = puxar(x.body); return { prefix: [{q:'forall',v:x.v}, ...p.prefix], matrix: p.matrix }; }
        case 'exists': { const p = puxar(x.body); return { prefix: [{q:'exists',v:x.v}, ...p.prefix], matrix: p.matrix }; }
        case 'and'   : { const L=puxar(x.left), R=puxar(x.right); return { prefix:[...L.prefix,...R.prefix], matrix:{type:'and', left:L.matrix, right:R.matrix} }; }
        case 'or'    : { const L=puxar(x.left), R=puxar(x.right); return { prefix:[...L.prefix,...R.prefix], matrix:{type:'or' , left:L.matrix, right:R.matrix} }; }
        case 'not':
        case 'pred':
        case 'eq':
        case 'neq'   : return { prefix: [], matrix: x };
        default      : return { prefix: [], matrix: x };
      }
    }
    return puxar(n);
  }

  /** Constrói CNF da matriz (distribui ∨ sobre ∧). */
  function paraMatrizCNF(n) {
    function distribuir(a,b){
      if (b.type === 'and') return { type:'and', left: distribuir(a,b.left), right: distribuir(a,b.right) };
      if (a.type === 'and') return { type:'and', left: distribuir(a.left,b), right: distribuir(a.right,b) };
      return { type:'or', left:a, right:b };
    }
    function ir(x){
      switch (x.type) {
        case 'and': return { type:'and', left: ir(x.left), right: ir(x.right) };
        case 'or' : return distribuir(ir(x.left), ir(x.right));
        case 'not':
        case 'pred':
        case 'eq':
        case 'neq': return x;
        default: return x;
      }
    }
    return ir(n);
  }

  /** Constrói DNF da matriz (distribui ∧ sobre ∨). */
  function paraMatrizDNF(n) {
    function distribuir(a,b){
      if (b.type === 'or') return { type:'or', left: distribuir(a,b.left), right: distribuir(a,b.right) };
      if (a.type === 'or') return { type:'or', left: distribuir(a.left,b), right: distribuir(a.right,b) };
      return { type:'and', left:a, right:b };
    }
    function ir(x){
      switch (x.type) {
        case 'and': return distribuir(ir(x.left), ir(x.right));
        case 'or' : return { type:'or', left: ir(x.left), right: ir(x.right) };
        case 'not':
        case 'pred':
        case 'eq':
        case 'neq': return x;
        default: return x;
      }
    }
    return ir(n);
  }

  /** Imprime um prefixo + matriz em LaTeX. */
  function prenexParaLatex(prefixo, matriz) {
    const Q = prefixo.map(({q,v})=> (q==='forall'?`\\forall\\, ${v}`:`\\exists\\, ${v}`)).join('\\, ');
    const M = (['pred','not','eq','neq'].includes(matriz.type))
      ? formulaParaLatex(matriz)
      : `\\left(${formulaParaLatex(matriz)}\\right)`;
    return Q ? `${Q}\\; ${M}` : M;
  }

  /** Skolemiza (remove ∃) e retorna a matriz skolemizada + mapeamentos. */
  function skolemizar(prefixo, matriz) {
    const universais = [];
    const mapeamento = [];
    let contadorFunc = 1, contadorConst = 1;

    function substituirVarNoTermo(t, v, termo) {
      if (t.kind === 'func') return { kind:'func', name:t.name, args:t.args.map(a=>substituirVarNoTermo(a,v,termo)) };
      return (t.name === v) ? clonar(termo) : t;
    }
    function substituirVarNaFormula(f, v, termo) {
      switch (f.type) {
        case 'pred': return { type:'pred', name:f.name, args:f.args.map(a=>substituirVarNoTermo(a,v,termo)) };
        case 'eq'  : return { type:'eq',  left: substituirVarNoTermo(f.left,v,termo), right: substituirVarNoTermo(f.right,v,termo) };
        case 'neq' : return { type:'neq', left: substituirVarNoTermo(f.left,v,termo), right: substituirVarNoTermo(f.right,v,termo) };
        case 'not' : return { type:'not', sub: substituirVarNaFormula(f.sub,v,termo) };
        case 'and' :
        case 'or'  : return { type:f.type, left: substituirVarNaFormula(f.left,v,termo), right: substituirVarNaFormula(f.right,v,termo) };
        default: return f;
      }
    }

    let M = clonar(matriz);
    for (const { q, v } of prefixo) {
      if (q === 'forall') universais.push(v);
      else {
        let termo;
        if (universais.length === 0) termo = { kind:'sym',  name:`sk_c${contadorConst++}` };
        else termo = { kind:'func', name:`sk_f${contadorFunc++}`, args: universais.map(u => ({ kind:'sym', name:u })) };
        mapeamento.push({ exists: v, term: termo });
        M = substituirVarNaFormula(M, v, termo);
      }
    }
    return { matrizSkolemizada: M, mapeamento, universais };
  }

  /** Extrai lista de cláusulas (array de arrays de literais) a partir da CNF. */
  function clausulasDeCNF(matriz) {
    function termoPlano(t){ return t.kind==='func' ? `${t.name}(${t.args.map(termoPlano).join(',')})` : t.name; }
    function predicadoStr(p){ const args=p.args?.length?`(${p.args.map(termoPlano).join(',')})`:''; return `${p.name}${args}`; }

    function literalStr(n){
      if (n.type === 'pred') return predicadoStr(n);
      if (n.type === 'not' && n.sub.type === 'pred') return `~${predicadoStr(n.sub)}`;
      if (n.type === 'eq')  return `(${termoPlano(n.left)}=${termoPlano(n.right)})`;
      if (n.type === 'neq') return `(${termoPlano(n.left)}≠${termoPlano(n.right)})`;
      if (n.type === 'not' && n.sub.type === 'eq')  return `~(${termoPlano(n.sub.left)}=${termoPlano(n.sub.right)})`;
      if (n.type === 'not' && n.sub.type === 'neq') return `~(${termoPlano(n.sub.left)}≠${termoPlano(n.sub.right)})`;
      throw new Error("Literal inválido.");
    }

    function dividirClausulas(n){
      if (n.type === 'and') return [...dividirClausulas(n.left), ...dividirClausulas(n.right)];
      return [dividirLiterais(n)];
    }
    function dividirLiterais(n){
      if (n.type === 'or') return [...dividirLiterais(n.left), ...dividirLiterais(n.right)];
      return [literalStr(n)];
    }
    return dividirClausulas(matriz);
  }

  /** Relatório de Horn: true se todas as cláusulas têm ≤ 1 literal positivo. */
  function relatorioHorn(clausulas){
    const violadoras = [];
    clausulas.forEach((cl,i) => {
      let positivos = 0;
      for (const lit of cl) if (!lit.startsWith('~')) positivos++;
      if (positivos > 1) violadoras.push(i+1);
    });
    return { isHorn: violadoras.length === 0, bad: violadoras };
  }

  // Exporta a API para uso no pipeline
  window.__logica = {
    analisar,
    eliminarImpEbi,
    paraNNF,
    padronizarVariaveis,
    paraPrenex,
    paraMatrizCNF,
    paraMatrizDNF,
    prenexParaLatex,
    skolemizar,
    clausulasDeCNF,
    relatorioHorn,
    formulaParaLatex
  };
})();

/* =========================================================================
   Pipeline: analisa, transforma e preenche todos os painéis
   =========================================================================*/
/**
 * Executa toda a sequência de passos (PCNF/PDNF/Cláusal/Horn),
 * injeta nos painéis e tipografa onde for LaTeX.
 */
async function executarPipelineERenderizar(fonte){
  try {
    limparPaineis();
    if (!fonte?.trim()) return;

    const L = window.__logica;

    // 1) Parse e transformações de base
    const ast0 = L.analisar(fonte);
    const ast1 = L.eliminarImpEbi(ast0);
    const ast2 = L.paraNNF(ast1);
    const ast3 = L.padronizarVariaveis(ast2);
    const { prefix: prefixo, matrix: matriz } = L.paraPrenex(ast3);

    // Matrizes normalizadas
    const cnf = L.paraMatrizCNF(matriz);
    const dnf = L.paraMatrizDNF(matriz);

    // --- PCNF ---
    definirLatex('#pcnf-original', L.formulaParaLatex(ast0));
    definirLatex('#pcnf-noimp',    L.formulaParaLatex(ast1));
    definirLatex('#pcnf-nnf',      L.formulaParaLatex(ast2));
    definirLatex('#pcnf-std',      L.formulaParaLatex(ast3));
    definirLatex('#pcnf-prenex',   L.prenexParaLatex(prefixo, matriz));
    definirLatex('#pcnf-final',    L.prenexParaLatex(prefixo, cnf));

    // --- PDNF ---
    definirLatex('#pdnf-original', L.formulaParaLatex(ast0));
    definirLatex('#pdnf-noimp',    L.formulaParaLatex(ast1));
    definirLatex('#pdnf-nnf',      L.formulaParaLatex(ast2));
    definirLatex('#pdnf-std',      L.formulaParaLatex(ast3));
    definirLatex('#pdnf-prenex',   L.prenexParaLatex(prefixo, matriz));
    definirLatex('#pdnf-final',    L.prenexParaLatex(prefixo, dnf));

    // --- Cláusal (passos 1–5 iguais) ---
    definirLatex('#claus-original', L.formulaParaLatex(ast0));
    definirLatex('#claus-noimp',    L.formulaParaLatex(ast1));
    definirLatex('#claus-nnf',      L.formulaParaLatex(ast2));
    definirLatex('#claus-std',      L.formulaParaLatex(ast3));
    definirLatex('#claus-prenex',   L.prenexParaLatex(prefixo, matriz));

    // 6) Skolemização (mostrando a matriz skolemizada tipografada)
    const { matrizSkolemizada } = L.skolemizar(prefixo, matriz);
    {
      const el = document.querySelector('#claus-skolem');
      if (el) {
        el.innerHTML = ""; // limpa
        const bloco = document.createElement("div");
        bloco.className = "mjx";
        bloco.style.textAlign = "center";
        bloco.innerHTML = `$$${L.formulaParaLatex(matrizSkolemizada)}$$`;
        el.appendChild(bloco);
        await renderizarMJX([bloco]);
      }
    }

    // 7) CNF da matriz skolemizada e extração das cláusulas (como LaTeX em lista)
    const cnfSk = L.paraMatrizCNF(matrizSkolemizada);
    const clausulas = L.clausulasDeCNF(cnfSk);

    if (clausulas.length) {
      const linhasLatex = clausulas.map((c,i) =>
        `${i+1}.\\;\\{ ${
          c.map(lit => lit.startsWith("~") ? `\\lnot ${lit.slice(1)}` : lit).join(" \\lor ")
        } \\}`
      ).join(' \\\\ ');

      const el = document.querySelector('#claus-final');
      if (el) {
        el.innerHTML = `<p>Cláusulas extraídas:</p>`;
        const bloco = document.createElement("div");
        bloco.className = "mjx";
        bloco.style.textAlign = "center";
        bloco.innerHTML = `\\[\\begin{gathered}${linhasLatex}\\end{gathered}\\]`;
        el.appendChild(bloco);
        await renderizarMJX([bloco]);
      }
    }

    // --- Horn: repete a lista e mostra o relatório ---
    if (clausulas.length) {
      const linhasHorn = clausulas.map((c,i) =>
        `${i+1}.\\;\\{ ${
          c.map(lit => lit.startsWith("~") ? `\\lnot ${lit.slice(1)}` : lit).join(" \\lor ")
        } \\}`
      ).join(' \\\\ ');

      const hc = document.querySelector('#horn-clauses');
      if (hc) {
        hc.innerHTML = `<p>Cláusulas extraídas da Forma Clausal:</p>`;
        const bloco = document.createElement('div');
        bloco.className = 'mjx';
        bloco.style.textAlign = 'center';
        bloco.innerHTML = `\\[\\begin{gathered}${linhasHorn}\\end{gathered}\\]`;
        hc.appendChild(bloco);
        await renderizarMJX([bloco]);
      }
    }

    const resumoHorn = L.relatorioHorn(clausulas);
    const elHorn = document.querySelector('#horn-report');
    if (elHorn) {
      elHorn.innerHTML = `
        <div style="text-align:center; font-weight:bold; padding:8px;">
          ${resumoHorn.isHorn
            ? 'É Horn: SIM ✅<br> Todas as cláusulas têm ≤ 1 literal positivo'
            : `É Horn: NÃO ❌<br> Cláusulas que violam: ${resumoHorn.bad.join(', ')}`}
        </div>
      `;
    }

    // Tipografa os blocos LaTeX estáticos dos painéis
    await renderizarMJX(
      alvosMJX.map(sel => document.querySelector(sel)).filter(Boolean)
    );

  } catch (erro) {
    console.error('[pipeline]', erro);
    if (caixaStatus) { caixaStatus.textContent = `Aviso: ${erro.message}`; caixaStatus.className = "status err"; }
  }
}
