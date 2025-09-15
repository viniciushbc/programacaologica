// ---- MathJax: garantir que esteja pronto antes de tipografar ----
async function mjxRender(nodes) {
  const list = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);

  // espera o MathJax carregar
  if (!window.MathJax?.typesetPromise) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };

      // quando a página terminar de carregar
      window.addEventListener('load', () => {
        if (window.MathJax?.typesetPromise) finish();
        else setTimeout(finish, 0);
      }, { once: true });

      // polling rápido (evita depender só do 'load')
      const id = setInterval(() => {
        if (window.MathJax?.typesetPromise) { clearInterval(id); finish(); }
      }, 50);

      // timeout de segurança
      setTimeout(() => { clearInterval(id); finish(); }, 2000);
    });
  }

  try {
    if (window.MathJax?.startup?.promise) await MathJax.startup.promise;
    if (window.MathJax?.typesetPromise) {
      await MathJax.typesetPromise(list);
    }
  } catch (e) {
    console.warn('MathJax ainda não pôde tipografar:', e);
  }
}


/* ---------- util UI ---------- */
function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
const $ = (sel) => document.querySelector(sel);

/* ---------- refs DOM ---------- */
const input     = $("#latexInput");
const output    = $("#output");
const statusBox = $("#status");
const renderBtn = $("#renderBtn");
const clearBtn  = $("#clearBtn");

/* ---------- MathJax: wrap + render preview ---------- */
function wrapLaTeX(src) {
  const s = src.trim();
  const startsWithDisplay = s.startsWith("$$") || s.startsWith("\\[");
  const startsWithInline  = s.startsWith("$")  || s.startsWith("\\(");
  if (startsWithDisplay || startsWithInline) return s;
  return `$$\n${s}\n$$`;
}

async function render() {
  try {
    const src = (input?.value || "").trim();
    if (!src) {
      if (output) output.innerHTML = "";
      if (statusBox) { statusBox.textContent = ""; statusBox.className = "status"; }
      clearPanels();
      return;
    }
    output.textContent = src;
    output.innerHTML = wrapLaTeX(src);
    await mjxRender([output]);
    if (statusBox) { statusBox.textContent = "Renderizado"; statusBox.className = "status ok"; }
    await runPipelineAndRenderAllSafe(src);
  } catch (err) {
    if (statusBox) { statusBox.textContent = "Erro ao renderizar."; statusBox.className = "status err"; }
    console.error(err);
  }
}

const renderLive = debounce(render, 300);
if (input) input.addEventListener("input", renderLive);
if (renderBtn) renderBtn.addEventListener("click", render);
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (input) input.value = "";
    if (output) output.innerHTML = "";
    if (statusBox) { statusBox.textContent = ""; statusBox.className = "status"; }
    clearPanels();
  });
}
document.addEventListener("DOMContentLoaded", render);

/* ---------- Alternância dos painéis ---------- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".pill");
  if (!btn) return;
  const targetSel = btn.getAttribute("data-target");
  const targetPanel = document.querySelector(targetSel);
  if (!targetPanel) return;

  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  targetPanel.classList.remove("hidden");

  document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  targetPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- Helpers dos painéis ---------- */
const mjxTargets = [
  '#pcnf-original','#pcnf-noimp','#pcnf-nnf','#pcnf-std','#pcnf-prenex','#pcnf-final',
  '#pdnf-original','#pdnf-noimp','#pdnf-nnf','#pdnf-std','#pdnf-prenex','#pdnf-final',
  '#claus-original','#claus-noimp','#claus-nnf','#claus-std','#claus-prenex'
];
const codeTargets = ['#claus-skolem','#claus-final','#horn-clauses','#horn-report'];

function clearPanels() {
  mjxTargets.forEach(sel => { const el = document.querySelector(sel); if (el) el.innerHTML = ''; });
  codeTargets.forEach(sel => { const el = document.querySelector(sel); if (el) el.innerHTML = ''; });
}
function setLatex(sel, latex) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.innerHTML = `$$${latex}$$`;
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function setCode(sel, text) {
  const el = document.querySelector(sel);
  if (!el) return;
  const escaped = escapeHtml(text);
  el.innerHTML = `<pre style="white-space:pre-wrap;margin:0">${escaped}</pre>`;
}

/* =========================================================================
   LÓGICA — Parser + Transformações
   ========================================================================*/
(function() {
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* --------- Tokenizer robusto --------- */
  function tokenize(input) {
    let s = input.trim();
    const tokens = [];
    let i = 0;

    const kwMap = {
      "\\forall":"FORALL","∀":"FORALL",
      "\\exists":"EXISTS","∃":"EXISTS",
      "\\neg":"NOT","\\lnot":"NOT","¬":"NOT","~":"NOT",
      "\\land":"AND","\\wedge":"AND","∧":"AND",
      "\\lor":"OR","\\vee":"OR","∨":"OR",
      "\\rightarrow":"IMP","\\to":"IMP","->":"IMP","⇒":"IMP","\\Rightarrow":"IMP","→":"IMP",
      "\\leftrightarrow":"IFF","\\iff":"IFF","<->":"IFF","⇔":"IFF","\\Leftrightarrow":"IFF","↔":"IFF",
      "=":"EQ","\\neq":"NEQ","\\ne":"NEQ","≠":"NEQ",
    };

    const skipPunctCmds = new Set(["\\,", "\\;", "\\:", "\\!"]);
    const skipWordCmds  = new Set([
      "left","right","big","Big","bigg","Bigg","quad","qquad",
      "enspace","hspace","vspace","text","mathrm","operatorname",
      "mathbf","mathit","mathsf","mathtt","color"
    ]);

    function skipBalancedGroup(idx) {
      while (idx < s.length && s[idx] !== '{') idx++;
      if (idx >= s.length) return idx;
      let depth = 0;
      while (idx < s.length) {
        const c = s[idx++];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
      }
      return idx;
    }

    function matchKeyword() {
      for (const [k, v] of Object.entries(kwMap)) {
        if (s.startsWith(k, i)) { i += k.length; return { type: v }; }
      }
      return null;
    }

    while (i < s.length) {
      const c = s[i];

      if (c === '%') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (/\s/.test(c)) { i++; continue; }

      if (c === '(' || c === '[' || c === '{') { tokens.push({ type: 'LP' }); i++; continue; }
      if (c === ')' || c === ']' || c === '}') { tokens.push({ type: 'RP' }); i++; continue; }

      if (c === ',') { tokens.push({ type: 'COMMA' }); i++; continue; }
      if (c === '.' || c === ':') { tokens.push({ type: 'DOT' }); i++; continue; }

      if (s.startsWith('->', i))  { tokens.push({ type: 'IMP' }); i += 2; continue; }
      if (s.startsWith('<->', i)) { tokens.push({ type: 'IFF' }); i += 3; continue; }

      const two = s.slice(i, i + 2);
      if (skipPunctCmds.has(two)) { i += 2; continue; }

      if (s[i] === '\\') {
        const kw = matchKeyword();
        if (kw) { tokens.push(kw); continue; }
        let j = i + 1;
        while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        const cmd = s.slice(i + 1, j);
        if (skipWordCmds.has(cmd)) {
          i = j;
          if (s[i] === '{') i = skipBalancedGroup(i);
          continue;
        }
        throw new Error(`Token inválido (comando \\${cmd})`);
      }

      const kw2 = matchKeyword();
      if (kw2) { tokens.push(kw2); continue; }

      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < s.length && /[A-Za-z0-9_\u00C0-\u017F]/.test(s[j])) j++;
        tokens.push({ type: 'ID', value: s.slice(i, j) });
        i = j;
        continue;
      }

      throw new Error(`Token inválido em "${s.slice(i, i + 12)}"`);
    }

    return tokens;
  }

  /* --------- Parser --------- */
  function parse(input) {
    const toks = tokenize(input);
    let pos = 0;

    const peek = () => toks[pos] || { type: 'EOF' };
    const eat  = (t) => { const x = peek(); if (x.type !== t) throw new Error(`Esperado ${t}, obtido ${x.type}`); pos++; return x; };
    const tryEat = (t) => (peek().type === t ? (pos++, true) : false);

    function parseTerm() {
      const id = eat('ID').value;
      if (tryEat('LP')) {
        const args = [];
        if (peek().type !== 'RP') {
          args.push(parseTerm());
          while (tryEat('COMMA')) args.push(parseTerm());
        }
        eat('RP');
        return { kind: 'func', name: id, args };
      }
      return { kind: 'sym', name: id };
    }

    function tryParseEquality() {
      const save = pos;
      try {
        if (peek().type !== 'ID' && peek().type !== 'LP') return null;
        if (peek().type === 'LP') return null;
        const leftTerm = parseTerm();
        const op = peek().type;
        if (op !== 'EQ' && op !== 'NEQ') { pos = save; return null; }
        pos++;
        const rightTerm = parseTerm();
        return { type: op === 'EQ' ? 'eq' : 'neq', left: leftTerm, right: rightTerm };
      } catch { pos = save; return null; }
    }

    function parseAtom() {
      const name = eat('ID').value;
      let args = [];
      if (tryEat('LP')) {
        if (peek().type !== 'RP') {
          args.push(parseTerm());
          while (tryEat('COMMA')) args.push(parseTerm());
        }
        eat('RP');
      }
      return { type: 'pred', name, args };
    }

    function parsePrimary() {
      const t = peek();

      if (t.type === 'LP') { eat('LP'); const f = parseIff(); eat('RP'); return f; }

      if (t.type === 'FORALL' || t.type === 'EXISTS') {
        const q = t.type === 'FORALL' ? 'forall' : 'exists'; pos++;
        const vars = [];
        vars.push(eat('ID').value);
        while (tryEat('COMMA')) vars.push(eat('ID').value);
        tryEat('DOT');

        let body;
        if (peek().type === 'LP') { eat('LP'); body = parseIff(); eat('RP'); }
        else { body = parseUnary(); }

        return vars.reverse().reduce((acc, v) => ({ type: q, v, body: acc }), body);
      }

      if (t.type === 'NOT') { eat('NOT'); const sub = parseUnary(); return { type: 'not', sub }; }

      const eq = tryParseEquality();
      if (eq) return eq;

      if (t.type === 'ID') return parseAtom();

      throw new Error(`Símbolo inesperado: ${t.type}`);
    }

    function parseUnary() { return parsePrimary(); }

    function leftAssoc(parseLower, ops) {
      let node = parseLower();
      while (ops.has(peek().type)) {
        const t = peek().type; pos++;
        const right = parseLower();
        const map = { AND: 'and', OR: 'or', IMP: 'imp', IFF: 'iff' };
        node = { type: map[t], left: node, right };
      }
      return node;
    }

    const parseAnd = () => leftAssoc(parseUnary, new Set(['AND']));
    const parseOr  = () => leftAssoc(parseAnd , new Set(['OR']));
    const parseImp = () => leftAssoc(parseOr  , new Set(['IMP']));
    const parseIff = () => leftAssoc(parseImp , new Set(['IFF']));

    const ast = parseIff();
    if (peek().type !== 'EOF') throw new Error("Sobrou entrada após parse.");
    return ast;
  }

  /* --------- Pretty LaTeX --------- */
  function termToLatex(t) {
    if (t.kind === 'func') return `${t.name}\\left(${t.args.map(termToLatex).join(',\\,')}\\right)`;
    return t.name;
  }
  function formulaToLatex(n) {
    switch (n.type) {
      case 'pred': {
        const args = n.args?.length ? `\\left(${n.args.map(termToLatex).join(',\\,')}\\right)` : '';
        return `${n.name}${args}`;
      }
      case 'eq':  return `${termToLatex(n.left)}\\,=\\,${termToLatex(n.right)}`;
      case 'neq': return `${termToLatex(n.left)}\\,\\ne\\,${termToLatex(n.right)}`;
      case 'not': {
        const inner = (n.sub.type === 'pred' || n.sub.type === 'eq' || n.sub.type === 'neq')
          ? formulaToLatex(n.sub)
          : `\\left(${formulaToLatex(n.sub)}\\right)`;
        return `\\neg ${inner}`;
      }
      case 'and':
      case 'or':
      case 'imp':
      case 'iff': {
        const op = { and: '\\land', or: '\\lor', imp: '\\rightarrow', iff: '\\leftrightarrow' }[n.type];
        const L = (['pred','not','eq','neq'].includes(n.left.type))  ? formulaToLatex(n.left)  : `\\left(${formulaToLatex(n.left)}\\right)`;
        const R = (['pred','not','eq','neq'].includes(n.right.type)) ? formulaToLatex(n.right) : `\\left(${formulaToLatex(n.right)}\\right)`;
        return `${L}\\;${op}\\;${R}`;
      }
      case 'forall':
      case 'exists': {
        const q = n.type === 'forall' ? '\\forall' : '\\exists';
        const body = (['pred','not','eq','neq'].includes(n.body.type))
          ? formulaToLatex(n.body) : `\\left(${formulaToLatex(n.body)}\\right)`;
        return `${q}\\, ${n.v}\\, ${body}`;
      }
      default: return '?';
    }
  }

  /* --------- Transforms --------- */
  function elimImpIff(n) {
    n = clone(n);
    function go(x) {
      switch (x.type) {
        case 'iff': {
          const A = go(x.left), B = go(x.right);
          return { type: 'and',
            left:  { type: 'or', left: { type: 'not', sub: A }, right: B },
            right: { type: 'or', left: { type: 'not', sub: B }, right: A }
          };
        }
        case 'imp': {
          const A = go(x.left), B = go(x.right);
          return { type: 'or', left: { type: 'not', sub: A }, right: B };
        }
        case 'and': return { type: 'and', left: go(x.left), right: go(x.right) };
        case 'or' : return { type: 'or' , left: go(x.left), right: go(x.right) };
        case 'not': return { type: 'not', sub: go(x.sub) };
        case 'forall': return { type: 'forall', v: x.v, body: go(x.body) };
        case 'exists': return { type: 'exists', v: x.v, body: go(x.body) };
        default: return x;
      }
    }
    return go(n);
  }

  function toNNF(n) {
    function neg(x) {
      switch (x.type) {
        case 'not': return toNNF(x.sub);
        case 'and': return { type: 'or',  left: neg(x.left),  right: neg(x.right) };
        case 'or' : return { type: 'and', left: neg(x.left),  right: neg(x.right) };
        case 'forall': return { type: 'exists', v: x.v, body: neg(x.body) };
        case 'exists': return { type: 'forall', v: x.v, body: neg(x.body) };
        case 'pred':
        case 'eq':
        case 'neq': return { type: 'not', sub: x };
        default:     return { type: 'not', sub: toNNF(x) };
      }
    }
    switch (n.type) {
      case 'not': return neg(n.sub);
      case 'and': return { type: 'and', left: toNNF(n.left), right: toNNF(n.right) };
      case 'or' : return { type: 'or' , left: toNNF(n.left), right: toNNF(n.right) };
      case 'forall': return { type: 'forall', v: n.v, body: toNNF(n.body) };
      case 'exists': return { type: 'exists', v: n.v, body: toNNF(n.body) };
      default: return n;
    }
  }

  function uniqName(base, used){ let i=1,n=(base||'x'); while(used.has(n)){ n=`${base}${i++}`;} used.add(n); return n; }

  function standardizeApart(n) {
    const used = new Set();
    (function collect(x) {
      switch (x.type) {
        case 'pred': x.args.forEach(walkTerm); break;
        case 'eq'  : walkTerm(x.left); walkTerm(x.right); break;
        case 'neq' : walkTerm(x.left); walkTerm(x.right); break;
        case 'not' : collect(x.sub); break;
        case 'and' :
        case 'or'  : collect(x.left); collect(x.right); break;
        case 'forall':
        case 'exists': used.add(x.v); collect(x.body); break;
      }
    })(n);
    function walkTerm(t){ if (t.kind==='func') t.args.forEach(walkTerm); else used.add(t.name); }
    function substTerm(t,env){
      if (t.kind==='func') return {kind:'func',name:t.name,args:t.args.map(a=>substTerm(a,env))};
      return {kind:t.kind,name:env.get(t.name)||t.name};
    }
    function go(x, env) {
      switch (x.type) {
        case 'pred': return { type: 'pred', name: x.name, args: x.args.map(a=>substTerm(a,env)) };
        case 'eq'  : return { type: 'eq' , left: substTerm(x.left,env), right: substTerm(x.right,env) };
        case 'neq' : return { type: 'neq', left: substTerm(x.left,env), right: substTerm(x.right,env) };
        case 'not' : return { type: 'not', sub: go(x.sub, env) };
        case 'and' : return { type: 'and', left: go(x.left,env), right: go(x.right,env) };
        case 'or'  : return { type: 'or' , left: go(x.left,env), right: go(x.right,env) };
        case 'forall':
        case 'exists': {
          const fresh = uniqName(x.v.replace(/[^a-z]/gi,'')||'x', used);
          const env2 = new Map(env); env2.set(x.v, fresh);
          return { type: x.type, v: fresh, body: go(x.body, env2) };
        }
        default: return x;
      }
    }
    return go(n, new Map());
  }

  function toPrenex(n) {
    function pull(x) {
      switch (x.type) {
        case 'forall': { const p = pull(x.body); return { prefix: [{q:'forall',v:x.v}, ...p.prefix], matrix: p.matrix }; }
        case 'exists': { const p = pull(x.body); return { prefix: [{q:'exists',v:x.v}, ...p.prefix], matrix: p.matrix }; }
        case 'and'   : { const L=pull(x.left), R=pull(x.right); return { prefix:[...L.prefix,...R.prefix], matrix:{type:'and', left:L.matrix, right:R.matrix} }; }
        case 'or'    : { const L=pull(x.left), R=pull(x.right); return { prefix:[...L.prefix,...R.prefix], matrix:{type:'or' , left:L.matrix, right:R.matrix} }; }
        case 'not':
        case 'pred':
        case 'eq':
        case 'neq'   : return { prefix: [], matrix: x };
        default      : return { prefix: [], matrix: x };
      }
    }
    return pull(n);
  }

  function toCNFMatrix(n) {
    function dist(a,b){
      if (b.type === 'and') return { type:'and', left: dist(a,b.left), right: dist(a,b.right) };
      if (a.type === 'and') return { type:'and', left: dist(a.left,b), right: dist(a.right,b) };
      return { type:'or', left:a, right:b };
    }
    function go(x){
      switch (x.type) {
        case 'and': return { type:'and', left: go(x.left), right: go(x.right) };
        case 'or' : return dist(go(x.left), go(x.right));
        case 'not':
        case 'pred':
        case 'eq':
        case 'neq': return x;
        default: return x;
      }
    }
    return go(n);
  }

  function toDNFMatrix(n) {
    function dist(a,b){
      if (b.type === 'or') return { type:'or', left: dist(a,b.left), right: dist(a,b.right) };
      if (a.type === 'or') return { type:'or', left: dist(a.left,b), right: dist(a.right,b) };
      return { type:'and', left:a, right:b };
    }
    function go(x){
      switch (x.type) {
        case 'and': return dist(go(x.left), go(x.right));
        case 'or' : return { type:'or', left: go(x.left), right: go(x.right) };
        case 'not':
        case 'pred':
        case 'eq':
        case 'neq': return x;
        default: return x;
      }
    }
    return go(n);
  }

  
  function prenexToLatex(prefix, matrix) {
    const Q = prefix.map(({q,v})=> (q==='forall'?`\\forall\\, ${v}`:`\\exists\\, ${v}`)).join('\\, ');
    const M = (['pred','not','eq','neq'].includes(matrix.type))
      ? formulaToLatex(matrix)
      : `\\left(${formulaToLatex(matrix)}\\right)`;
    return Q ? `${Q}\\; ${M}` : M;
  }

  function skolemize(prefix, matrix) {
    const universals = [];
    const mapping = [];
    let skF = 1, skC = 1;

    function replaceVarInTerm(t, v, term) {
      if (t.kind === 'func') return { kind:'func', name:t.name, args:t.args.map(a=>replaceVarInTerm(a,v,term)) };
      return (t.name === v) ? clone(term) : t;
    }
    function replaceVarInFormula(f, v, term) {
      switch (f.type) {
        case 'pred': return { type:'pred', name:f.name, args:f.args.map(a=>replaceVarInTerm(a,v,term)) };
        case 'eq'  : return { type:'eq',  left: replaceVarInTerm(f.left,v,term), right: replaceVarInTerm(f.right,v,term) };
        case 'neq' : return { type:'neq', left: replaceVarInTerm(f.left,v,term), right: replaceVarInTerm(f.right,v,term) };
        case 'not' : return { type:'not', sub: replaceVarInFormula(f.sub,v,term) };
        case 'and' :
        case 'or'  : return { type:f.type, left: replaceVarInFormula(f.left,v,term), right: replaceVarInFormula(f.right,v,term) };
        default: return f;
      }
    }

    let M = clone(matrix);
    for (const { q, v } of prefix) {
      if (q === 'forall') universals.push(v);
      else {
        let term;
        if (universals.length === 0) term = { kind:'sym',  name:`sk_c${skC++}` };
        else term = { kind:'func', name:`sk_f${skF++}`, args: universals.map(u => ({ kind:'sym', name:u })) };
        mapping.push({ exists: v, term });
        M = replaceVarInFormula(M, v, term);
      }
    }
    return { matrixSkolem: M, mapping, universals };
  }

  function clausesFromCNF(matrix) {
    function termToPlain(t){ return t.kind==='func' ? `${t.name}(${t.args.map(termToPlain).join(',')})` : t.name; }
    function predToStr(p){ const args=p.args?.length?`(${p.args.map(termToPlain).join(',')})`:''; return `${p.name}${args}`; }

    function litToStr(n){
      if (n.type === 'pred') return predToStr(n);
      if (n.type === 'not' && n.sub.type === 'pred') return `~${predToStr(n.sub)}`;
      if (n.type === 'eq')  return `(${termToPlain(n.left)}=${termToPlain(n.right)})`;
      if (n.type === 'neq') return `(${termToPlain(n.left)}≠${termToPlain(n.right)})`;
      if (n.type === 'not' && n.sub.type === 'eq')  return `~(${termToPlain(n.sub.left)}=${termToPlain(n.sub.right)})`;
      if (n.type === 'not' && n.sub.type === 'neq') return `~(${termToPlain(n.sub.left)}≠${termToPlain(n.sub.right)})`;
      throw new Error("Literal inválido.");
    }

    function splitClauses(n){
      if (n.type === 'and') return [...splitClauses(n.left), ...splitClauses(n.right)];
      return [splitLits(n)];
    }
    function splitLits(n){
      if (n.type === 'or') return [...splitLits(n.left), ...splitLits(n.right)];
      return [litToStr(n)];
    }
    return splitClauses(matrix);
  }

  function hornReport(clauses){
    const bad = [];
    clauses.forEach((cl,i) => {
      let pos = 0;
      for (const lit of cl) if (!lit.startsWith('~')) pos++;
      if (pos > 1) bad.push(i+1);
    });
    return { isHorn: bad.length === 0, bad };
  }

  window.__logic = {
    parse, elimImpIff, toNNF, standardizeApart, toPrenex,
    toCNFMatrix, toDNFMatrix, prenexToLatex, skolemize,
    clausesFromCNF, hornReport, formulaToLatex
  };
})();


/* ---------- Pipeline + Render ---------- */
async function runPipelineAndRenderAllSafe(src){
  try {
    clearPanels();
    if (!src?.trim()) return;

    const L = window.__logic;
    const ast0 = L.parse(src);
    const ast1 = L.elimImpIff(ast0);
    const ast2 = L.toNNF(ast1);
    const ast3 = L.standardizeApart(ast2);
    const { prefix, matrix } = L.toPrenex(ast3);
    const cnf = L.toCNFMatrix(matrix);
    const dnf = L.toDNFMatrix(matrix);

    // PCNF
    setLatex('#pcnf-original', L.formulaToLatex(ast0));
    setLatex('#pcnf-noimp',    L.formulaToLatex(ast1));
    setLatex('#pcnf-nnf',      L.formulaToLatex(ast2));
    setLatex('#pcnf-std',      L.formulaToLatex(ast3));
    setLatex('#pcnf-prenex',   L.prenexToLatex(prefix, matrix));
    setLatex('#pcnf-final',    L.prenexToLatex(prefix, cnf));

    // PDNF
    setLatex('#pdnf-original', L.formulaToLatex(ast0));
    setLatex('#pdnf-noimp',    L.formulaToLatex(ast1));
    setLatex('#pdnf-nnf',      L.formulaToLatex(ast2));
    setLatex('#pdnf-std',      L.formulaToLatex(ast3));
    setLatex('#pdnf-prenex',   L.prenexToLatex(prefix, matrix));
    setLatex('#pdnf-final',    L.prenexToLatex(prefix, dnf));

    // CLAUSAL (1–5)
    setLatex('#claus-original', L.formulaToLatex(ast0));
    setLatex('#claus-noimp',    L.formulaToLatex(ast1));
    setLatex('#claus-nnf',      L.formulaToLatex(ast2));
    setLatex('#claus-std',      L.formulaToLatex(ast3));
    setLatex('#claus-prenex',   L.prenexToLatex(prefix, matrix));


  function appendLatex(sel, latex) {
  const el = document.querySelector(sel);
  if (!el) return;
  const div = document.createElement("div");
  div.className = "mjx";
  div.innerHTML = `$$${latex}$$`;
  el.appendChild(div);
  mjxRender([div]);
  }

// === Etapa 6) Skolemização + remoção de ∀ ===
const { matrixSkolem } = L.skolemize(prefix, matrix);
{
  const el = document.querySelector('#claus-skolem');
  if (el) {
    el.innerHTML = ""; // limpa
    const div = document.createElement("div");
    div.className = "mjx";
    div.style.textAlign = "center";
    div.innerHTML = `$$${L.formulaToLatex(matrixSkolem)}$$`;
    el.appendChild(div);
    await mjxRender([div]);
  }
}



// 7) CNF e Extração das cláusulas
const cnfSk = L.toCNFMatrix(matrixSkolem);
const clauses = L.clausesFromCNF(cnfSk);

if (clauses.length) {
  const latexLines = clauses.map((c,i) =>
    `${i+1}.\\;\\{ ${
      c.map(lit => lit.startsWith("~") ? `\\lnot ${lit.slice(1)}` : lit).join(" \\lor ")
    } \\}`
  ).join(' \\\\ ');

  const el = document.querySelector('#claus-final');
  if (el) {
    el.innerHTML = `<p>Cláusulas extraídas:</p>`;
    const div = document.createElement("div");
    div.className = "mjx";
    div.style.textAlign = "center";
    div.innerHTML = `\\[\\begin{gathered}${latexLines}\\end{gathered}\\]`;
    el.appendChild(div);
    await mjxRender([div]);
  }
}



// Horn 
if (clauses.length) {
  const hornLatexLines = clauses.map((c,i) =>
    `${i+1}.\\;\\{ ${
      c.map(lit => lit.startsWith("~") ? `\\lnot ${lit.slice(1)}` : lit).join(" \\lor ")
    } \\}`
  ).join(' \\\\ ');

  const hc = document.querySelector('#horn-clauses');
  if (hc) {
    hc.innerHTML = `<p>Cláusulas extraídas da Forma Clausal:</p>`;
    const div = document.createElement('div');
    div.className = 'mjx';
    div.style.textAlign = 'center';
    div.innerHTML = `\\[\\begin{gathered}${hornLatexLines}\\end{gathered}\\]`;
    hc.appendChild(div);
    await mjxRender([div]);
  }
}


// Relatório Horn
const horn = L.hornReport(clauses);
const hornEl = document.querySelector('#horn-report');
if (hornEl) {
  hornEl.innerHTML = `
    <div style="text-align:center; font-weight:bold; padding:8px;">
      ${horn.isHorn
        ? 'É Horn: SIM ✅<br> Todas as cláusulas têm ≤ 1 literal positivo'
        : `É Horn: NÃO ❌<br> Cláusulas que violam: ${horn.bad.join(', ')}`}
    </div>
  `;
}

    // Tipografar LaTeX dos blocos mjx
    await mjxRender(
      mjxTargets.map(sel => document.querySelector(sel)).filter(Boolean)
    );
  } catch (e) {
    console.error('[pipeline]', e);
    if (statusBox) { statusBox.textContent = `Aviso: ${e.message}`; statusBox.className = "status err"; }
  }
}
