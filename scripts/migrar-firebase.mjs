// ─────────────────────────────────────────────────────────────────────────
// Copia as vendas do Bruxcon v1 (Firestore, coleção `vendas`) para a
// tabela `vendas` do Supabase, dentro de um evento já criado pela tela.
//
// Entra no Firebase com um login de ADMIN da v1 (o mesmo e-mail e senha
// que a pessoa usa no app antigo) e lê pela API REST do Firestore — não
// precisa de chave de serviço do Google nem de exportar planilha.
//
// Uso:
//   node scripts/migrar-firebase.mjs --evento <slug> --email <admin-v1> --senha <senha-v1>
//   node scripts/migrar-firebase.mjs --evento <slug> --email ... --senha ... --apply
//
// Antes de rodar: o evento precisa existir (criado pela tela, no projeto
// DTC Master) e a equipe precisa estar cadastrada (scripts/criar-usuarios.mjs).
// A venda é ligada ao usuário pelo e-mail de quem registrou na v1.
//
// IDEMPOTENTE: o id da venda no Postgres é derivado do id do documento no
// Firestore. Rodar duas vezes não duplica — a segunda só pula.
//
// A pontuação vem CONGELADA da v1 (`pts`, `r2`, `r3`, `r4`): é o que estava
// no ranking. Nada é recalculado.
// ─────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { conectar } from "./db.mjs";

const FIREBASE = {
  apiKey: "AIzaSyDGbDDOOEX6IwS8ZvssID2WwvStDD6yJkI",
  projectId: "bruxcon-pontuacao",
};

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const APLICAR = process.argv.includes("--apply");
const SLUG = arg("evento");
const EMAIL = arg("email");
const SENHA = arg("senha");

if (!SLUG || !EMAIL || !SENHA) {
  console.error("Uso: node scripts/migrar-firebase.mjs --evento <slug> --email <admin-v1> --senha <senha-v1> [--apply]");
  process.exit(1);
}

// ── Firebase ────────────────────────────────────────────────────────────

async function entrarNoFirebase() {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE.apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: SENHA, returnSecureToken: true }),
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(`Login no Firebase falhou: ${j.error?.message ?? r.status}`);
  return j.idToken;
}

/** Valor tipado do Firestore REST → valor JS. */
function lerValor(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  return null;
}

async function lerVendas(token) {
  const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/vendas`;
  const docs = [];
  let pagina = "";
  do {
    const r = await fetch(`${base}?pageSize=300${pagina ? `&pageToken=${pagina}` : ""}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Leitura do Firestore falhou: ${j.error?.message ?? r.status}`);
    for (const d of j.documents ?? []) {
      const campos = Object.fromEntries(
        Object.entries(d.fields ?? {}).map(([k, v]) => [k, lerValor(v)])
      );
      docs.push({ _id: d.name.split("/").pop(), ...campos });
    }
    pagina = j.nextPageToken ?? "";
  } while (pagina);
  return docs;
}

// ── Conversão ───────────────────────────────────────────────────────────

/** UUID estável a partir do id do Firestore (formato v5). */
function uuidDoDoc(id) {
  const h = createHash("sha1").update(`bruxcon-v1:${id}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Mesmo `detalhe` que o motor grava, montado a partir das flags da v1. */
function detalheDaV1(v) {
  return [
    { regraId: "base", label: "Ponto recorrente (base)", tag: "1", pontos: 1 },
    { regraId: "faixa-alta", label: "Recebido acima de R$ 15.000", tag: "+1", pontos: v.r2 ? 1 : 0 },
    { regraId: "completo", label: "Recebimento completo", tag: "+1", pontos: v.r3 ? 1 : 0 },
    { regraId: "segunda-cadeira", label: "2ª cadeira incluída", tag: "+½", pontos: v.r4 ? 0.5 : 0 },
  ];
}

// ── Execução ────────────────────────────────────────────────────────────

console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para gravar)\n");

const token = await entrarNoFirebase();
const vendasV1 = await lerVendas(token);
console.log(`Firestore: ${vendasV1.length} vendas lidas.`);

const c = conectar();
await c.connect();

const { rows: eventos } = await c.query(`select id, nome from public.eventos where slug = $1`, [SLUG]);
if (eventos.length !== 1) {
  console.error(
    eventos.length
      ? `Há ${eventos.length} eventos com o slug "${SLUG}" (um por projeto). Deixe só um ou renomeie.`
      : `Evento "${SLUG}" não encontrado. Crie pela tela antes de migrar.`
  );
  await c.end();
  process.exit(1);
}
const evento = eventos[0];
console.log(`Destino: ${evento.nome}\n`);

const { rows: usuarios } = await c.query(`select id, lower(email) email, nome from public.usuarios`);
const porEmail = new Map(usuarios.map((u) => [u.email, u]));
const porNome = new Map(usuarios.map((u) => [u.nome.toLowerCase(), u]));

const linhas = [];
const semDono = [];
for (const v of vendasV1) {
  const dono =
    porEmail.get(String(v.emailCloser ?? "").toLowerCase().trim()) ??
    porNome.get(String(v.closer ?? "").toLowerCase().trim());
  if (!dono) {
    semDono.push(v);
    continue;
  }
  const criadoEm = v.ts ? new Date(num(v.ts)).toISOString() : new Date().toISOString();
  linhas.push({
    id: uuidDoDoc(v._id),
    evento_id: evento.id,
    usuario_id: dono.id,
    closer_nome: v.closer || dono.nome,
    email_closer: (v.emailCloser || dono.email).toLowerCase(),
    cliente: v.cliente || "(sem nome)",
    email: v.email || null,
    telefone: v.telefone || null,
    data_venda: v.dataVenda || criadoEm.slice(0, 10),
    produto: v.produto || "DTC Master",
    produto_id: "dtc-master",
    valor: num(v.valor),
    recebido: num(v.recebido),
    faixa: v.faixa === null || v.faixa === undefined ? null : num(v.faixa),
    faixa_label: v.faixaLabel || null,
    cadeira: v.cadeira === "sim",
    valor_cadeira: num(v.valorCadeira),
    completo: v.completo === "sim",
    restante: Math.max(0, num(v.restante)),
    negociacao: v.negociacao || null,
    pts: num(v.pts),
    pontos_detalhe: JSON.stringify(detalheDaV1(v)),
    criado_em: criadoEm,
  });
}

const { rows: existentes } = await c.query(
  `select id from public.vendas where id = any($1::uuid[])`,
  [linhas.map((l) => l.id)]
);
const jaMigradas = new Set(existentes.map((r) => r.id));
const novas = linhas.filter((l) => !jaMigradas.has(l.id));

const resumo = new Map();
for (const l of linhas) {
  const r = resumo.get(l.closer_nome) ?? { vendas: 0, pontos: 0, recebido: 0 };
  r.vendas += 1;
  r.pontos += l.pts;
  r.recebido += l.recebido;
  resumo.set(l.closer_nome, r);
}
console.log("── Conferência com o ranking da v1 ──");
console.table(
  [...resumo.entries()]
    .sort((a, b) => b[1].pontos - a[1].pontos || b[1].recebido - a[1].recebido)
    .map(([nome, r]) => ({ nome, vendas: r.vendas, pontos: r.pontos, recebido: r.recebido }))
);

console.log(`\nA gravar: ${novas.length} · já migradas: ${jaMigradas.size} · sem usuário: ${semDono.length}`);
if (semDono.length) {
  console.log("\n⚠️  Vendas cujo vendedor não está cadastrado (cadastre e rode de novo):");
  semDono.forEach((v) => console.log(`     ${String(v.closer).padEnd(18)} ${v.emailCloser ?? ""}  ${v.cliente}`));
}

if (!APLICAR) {
  console.log("\nNada foi gravado. Rode de novo com --apply.");
  await c.end();
  process.exit(0);
}

const colunas = Object.keys(novas[0] ?? {});
await c.query("begin");
try {
  for (const l of novas) {
    const valores = colunas.map((k) => l[k]);
    const marcadores = colunas.map((k, i) => (k === "pontos_detalhe" ? `$${i + 1}::jsonb` : `$${i + 1}`));
    await c.query(
      `insert into public.vendas (${colunas.join(", ")}) values (${marcadores.join(", ")})
       on conflict (id) do nothing`,
      valores
    );
  }
  await c.query("commit");
  console.log(`\n✓ ${novas.length} vendas gravadas em "${evento.nome}".`);
} catch (e) {
  await c.query("rollback");
  console.error(`\n✗ Nada foi gravado: ${e.message}`);
  process.exitCode = 1;
}
await c.end();
