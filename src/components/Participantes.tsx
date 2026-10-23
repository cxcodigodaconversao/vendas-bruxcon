"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Instagram, MessageCircle, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_ABORDAGEM, SELECT_INSCRITO } from "@/lib/consultas";
import { fmtVal } from "@/lib/config";
import { CLASSES, normalizarEmail, type Classe, type Inscrito } from "@/lib/analise";
import {
  abordagensPorEmail,
  COMBINACOES,
  contarPorClasse,
  contarPorDia,
  camposDisponiveis,
  fichaDoInscrito,
  ehAluno,
  ehMembroMaster,
  ehNaoAluno,
  filtrarAluno,
  filtrarClasse,
  filtrarDia,
  filtrarParticipantes,
  filtrarPresenca,
  filtrarResposta,
  linkInstagram,
  linkWhatsapp,
  ordenarParticipantes,
  resumoPresenca,
  rotulosPresenca,
  valoresDoCampo,
  type FiltroAluno,
  type FiltroDia,
  type FiltroPresenca,
} from "@/lib/participantes";
import { filtrarRecorte, RECORTES, temTurnos } from "@/lib/periodos";
import type { Abordagem, Evento, Usuario, Venda } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, Empty, SectionLabel } from "./ui/card";
import { Field, Input, Select, Textarea } from "./ui/field";
import { useFeedback } from "./ui/feedback";

/**
 * Aba Participantes — a lista de inscritos do painel, pesquisável, com a
 * ficha completa de cada um e os atalhos de contato.
 *
 * É a tela que o closer abre antes de abordar alguém: quem é, que classe
 * de Lead Score tem, o que respondeu no formulário, se já comprou. Por isso
 * a lista é ordenada por classe (melhor primeiro) e não alfabeticamente.
 *
 * A busca roda toda no cliente: são ~500 registros já carregados, e ir ao
 * banco a cada tecla deixaria a digitação travada no celular do salão.
 */
export function Participantes({ evento, vendas, perfil }: { evento: Evento; vendas: Venda[]; perfil: Usuario }) {
  const { toast } = useFeedback();
  const [inscritos, setInscritos] = useState<Inscrito[] | null>(null);
  const [termo, setTermo] = useState("");
  const [presenca, setPresenca] = useState<FiltroPresenca>("todos");
  const [aluno, setAluno] = useState<FiltroAluno>("todos");
  const [dia, setDia] = useState<FiltroDia>("todos");
  const [classes, setClasses] = useState<Set<Classe>>(new Set());
  const [campoResp, setCampoResp] = useState("");
  const [valorResp, setValorResp] = useState("");
  const [recorte, setRecorte] = useState("");
  const [aberto, setAberto] = useState<Inscrito | null>(null);
  const [abordagens, setAbordagens] = useState<Abordagem[]>([]);

  useEffect(() => {
    setInscritos(null);
    setAberto(null);
    setTermo("");
    setPresenca("todos");
    setAluno("todos");
    setDia("todos");
    setClasses(new Set());
    setCampoResp("");
    setValorResp("");
    setRecorte("");
    (async () => {
      const { data, error } = await supabase
        .from("inscritos")
        .select(SELECT_INSCRITO)
        .eq("evento_id", evento.id);
      if (error) return toast("erro", "Não foi possível carregar os participantes.", error.message);
      setInscritos((data ?? []) as unknown as Inscrito[]);
      const { data: abs } = await supabase
        .from("abordagens")
        .select(SELECT_ABORDAGEM)
        .eq("evento_id", evento.id);
      setAbordagens((abs ?? []) as unknown as Abordagem[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento.id]);

  /** E-mails que já compraram — o selo "Comprou" na lista sai daqui. */
  const compradores = useMemo(() => {
    const m = new Map<string, Venda[]>();
    for (const v of vendas) {
      const e = normalizarEmail(v.email);
      if (e) m.set(e, [...(m.get(e) ?? []), v]);
    }
    return m;
  }, [vendas]);

  const porEmail = useMemo(() => abordagensPorEmail(abordagens), [abordagens]);

  async function registrarAbordagem(email: string, observacao: string) {
    const { data, error } = await supabase
      .from("abordagens")
      .insert({
        evento_id: evento.id,
        email,
        usuario_id: perfil.id,
        por_nome: perfil.nome,
        observacao: observacao.trim(),
      })
      .select(SELECT_ABORDAGEM)
      .single();
    if (error) {
      toast("erro", "Não foi possível salvar a observação.", error.message);
      return false;
    }
    setAbordagens((a) => [...a, data as unknown as Abordagem]);
    toast("sucesso", "Abordagem registrada.");
    return true;
  }

  /** Busca + filtro por resposta: a base que os outros filtros recortam. */
  const buscar = (l: Inscrito[]) => filtrarResposta(filtrarParticipantes(l, termo), campoResp, valorResp);

  const lista = useMemo(
    () =>
      inscritos
        ? ordenarParticipantes(
            filtrarClasse(
              filtrarRecorte(filtrarDia(filtrarAluno(filtrarPresenca(buscar(inscritos), presenca), aluno), dia), recorte),
              classes
            )
          )
        : [],
    [inscritos, termo, campoResp, valorResp, recorte, presenca, aluno, dia, classes]
  );

  /** Contagem por classe respeitando os OUTROS filtros (busca, presença,
   *  aluno) — assim o número no chip é "quantos dessa classe eu veria". */
  const porClasse = useMemo(
    () =>
      contarPorClasse(
        inscritos
          ? filtrarRecorte(filtrarDia(filtrarAluno(filtrarPresenca(buscar(inscritos), presenca), aluno), dia), recorte)
          : []
      ),
    [inscritos, termo, campoResp, valorResp, recorte, presenca, aluno, dia]
  );

  /** Mesma ideia para os chips de dia: respeitam busca, aluno e classe. */
  const porDia = useMemo(
    () =>
      contarPorDia(
        inscritos ? filtrarClasse(filtrarAluno(buscar(inscritos), aluno), classes) : []
      ),
    [inscritos, termo, campoResp, valorResp, aluno, classes]
  );
  /** Base das porcentagens dos chips: presentes com dia marcado. */
  const comDia = COMBINACOES.reduce((s, c) => s + porDia[c.chave], 0);

  function escolherDia(v: FiltroDia) {
    setDia(v);
    setRecorte("");
  }

  function alternarClasse(c: Classe) {
    setClasses((atual) => {
      const n = new Set(atual);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  }

  /** Contadores dos chips: presentes vêm do painel importado, não do app. */
  const resumo = useMemo(() => (inscritos ? resumoPresenca(inscritos) : null), [inscritos]);
  const nMaster = useMemo(() => (inscritos ? inscritos.filter(ehMembroMaster).length : 0), [inscritos]);
  const campos = useMemo(() => (inscritos ? camposDisponiveis(inscritos) : []), [inscritos]);
  const valores = useMemo(
    () => (inscritos && campoResp ? valoresDoCampo(inscritos, campoResp) : []),
    [inscritos, campoResp]
  );
  /** Chips de período (manhã/tarde): mesma base dos chips de dia. Só
   *  aparecem se a base importada tem check-in por turno. */
  const temPeriodos = useMemo(() => (inscritos ? temTurnos(inscritos) : false), [inscritos]);
  const porPeriodo = useMemo(() => {
    const base = inscritos ? filtrarClasse(filtrarAluno(buscar(inscritos), aluno), classes) : [];
    return Object.fromEntries(CHIPS_PERIODO.map((c) => [c.valor, filtrarRecorte(base, c.valor).length]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inscritos, termo, campoResp, valorResp, aluno, classes]);
  const filtrando = Boolean(termo) || Boolean(valorResp) || Boolean(recorte) || presenca !== "todos" || aluno !== "todos" || dia !== "todos" || classes.size > 0;

  if (inscritos === null) return <Empty>Carregando…</Empty>;
  if (!inscritos.length) {
    return <Empty>Nenhum participante importado. Um admin pode subir a planilha (ou o HTML do painel) na aba Análise.</Empty>;
  }

  if (aberto) {
    return (
      <Ficha
        inscrito={aberto}
        vendas={compradores.get(aberto.email) ?? []}
        abordagens={porEmail.get(aberto.email) ?? []}
        onRegistrar={(obs) => registrarAbordagem(aberto.email, obs)}
        onVoltar={() => setAberto(null)}
      />
    );
  }

  return (
    <>
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome, e-mail, telefone, CRO ou eTicket"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          {/* Filtro por resposta do formulário/origem: escolhe o campo, depois
              o valor. Só aparecem campos que a base importada tem. */}
          {campos.length > 0 && (
            <div className="mt-3 flex gap-2">
              <Select
                value={campoResp}
                onChange={(e) => {
                  setCampoResp(e.target.value);
                  setValorResp("");
                }}
                className="flex-1"
                aria-label="Filtrar por resposta"
              >
                <option value="">Filtrar por resposta…</option>
                {campos.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.label}
                  </option>
                ))}
              </Select>
              {campoResp && (
                <Select
                  value={valorResp}
                  onChange={(e) => setValorResp(e.target.value)}
                  className="flex-1"
                  aria-label="Valor da resposta"
                >
                  <option value="">Todos</option>
                  {valores.map((v) => (
                    <option key={v.valor} value={v.valor}>
                      {v.valor} ({v.n})
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
          {/* Filtros rápidos: o time quer olhar "só quem está no salão" sem
              abrir ficha por ficha. Presença e aluno combinam entre si. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Chips<FiltroPresenca>
              valor={presenca}
              onChange={setPresenca}
              opcoes={[
                { valor: "todos", label: "Todos" },
                { valor: "presentes", label: `Presentes · ${resumo?.presentes ?? 0}` },
              ]}
            />
            <Chips<FiltroAluno>
              valor={aluno}
              onChange={setAluno}
              opcoes={[
                { valor: "todos", label: "Todos" },
                { valor: "master", label: `Membro Master · ${nMaster}` },
                { valor: "alunos", label: "Alunos" },
                { valor: "nao_alunos", label: "Não alunos" },
              ]}
            />
          </div>
          {/* Dias: "esteve no dia" (qualquer combinação) na primeira linha,
              combinação EXATA na segunda. Um só filtro ativo por vez; tocar
              de novo no ativo volta para todos. % = dos presentes com dia. */}
          <div className="mt-3 space-y-1.5">
            <DiaChips
              valor={dia}
              onChange={escolherDia}
              opcoes={[
                { valor: "d1", label: "1º dia" },
                { valor: "d2", label: "2º dia" },
                { valor: "d3", label: "3º dia" },
              ]}
              contagem={porDia}
              base={comDia}
            />
            <DiaChips
              valor={dia}
              onChange={escolherDia}
              opcoes={COMBINACOES.map((c) => ({ valor: c.chave, label: c.label }))}
              contagem={porDia}
              base={comDia}
            />
            {/* Manhã e tarde (check-in por turno). Exclusivo com os de cima:
                tocar num período desliga o dia, e vice-versa. */}
            {temPeriodos && (
              <>
                <DiaChips
                  valor={recorte || "todos"}
                  onChange={(v) => {
                    setRecorte(v === "todos" ? "" : v);
                    setDia("todos");
                  }}
                  opcoes={CHIPS_PERIODO}
                  contagem={porPeriodo}
                  base={comDia}
                />
                {recorte && (
                  <p className="text-xs text-muted">{RECORTES.find((r) => r.chave === recorte)?.descricao}</p>
                )}
              </>
            )}
          </div>
          {/* Lead Score: filtro e legenda ao mesmo tempo. Cores do painel;
              toque liga/desliga a classe, pode marcar várias. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CLASSES.map((c) => {
              const ativo = classes.has(c);
              const apagado = classes.size > 0 && !ativo;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => alternarClasse(c)}
                  title={LEGENDA[c]}
                  className={`num inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-opacity ${
                    apagado ? "opacity-35" : ""
                  } ${ativo ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : ""}`}
                  style={{ backgroundColor: COR[c].fundo, color: COR[c].texto }}
                >
                  {c}
                  <span className="font-normal opacity-80">{porClasse[c]}</span>
                </button>
              );
            })}
            {classes.size > 0 && (
              <button
                type="button"
                onClick={() => setClasses(new Set())}
                className="h-7 rounded-full px-2.5 text-xs text-muted-foreground underline underline-offset-2"
              >
                limpar
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">
            {CLASSES.map((c, k) => (
              <span key={c}>
                {k > 0 && " · "}
                <span className="font-semibold">{c}</span> {LEGENDA_CURTA[c]}
              </span>
            ))}
          </p>
          <p className="mt-2 text-xs text-muted">
            {lista.length} de {inscritos.length} participante{inscritos.length === 1 ? "" : "s"}
            {filtrando ? " (filtrado)" : ""}
            {presenca === "presentes" && resumo && (
              <>
                {" "}· {resumo.masters ? `${resumo.masters} Membro Master, ` : ""}
                {resumo.alunos} aluno{resumo.alunos === 1 ? "" : "s"}, {resumo.naoAlunos} não
                {resumo.semResposta > 0 ? `, ${resumo.semResposta} sem resposta` : ""}
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {lista.length === 0 ? (
        <Empty>{termo ? <>Ninguém encontrado com “{termo}”.</> : "Ninguém nesse filtro ainda."}</Empty>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
            {lista.map((i) => (
              <button
                key={i.email}
                onClick={() => setAberto(i)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {rotulosPresenca(i).length ? "Presente" : "Sem check-in"}
                    {i.contatoConfirmou === "Confirmou" ? " · Confirmou" : ""}
                  </span>
                  {/* Quem fechou aparece embaixo do nome: na lista cheia é o que
                      o time pergunta primeiro ("quem já pegou essa?"). */}
                  {!compradores.has(i.email) && porEmail.has(i.email) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      Abordado por {porEmail.get(i.email)![0].porNome}
                    </span>
                  )}
                  {compradores.get(i.email)?.[0] && (
                    <span className="block truncate text-xs text-success">
                      Vendido por {compradores.get(i.email)![0].closerNome}
                    </span>
                  )}
                </span>
                {/* Coluna da direita: o que o time precisa ver de relance,
                    sem abrir a ficha — em que dia(s) a pessoa esteve e se já
                    é aluna. Os dias chegam prontos do painel importado. */}
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {/* Lead Score primeiro, na cor da classe do painel: é o que
                      define a ordem de abordagem, então tem que bater o olho. */}
                  <ClasseSelo classe={i.classe} nota={i.nota} />
                  {rotulosPresenca(i).map((r) => (
                    <Badge key={r} tone="success" className="whitespace-nowrap">
                      {r}
                    </Badge>
                  ))}
                  {/* Sem resposta no formulário = sem selo, de propósito. */}
                  {ehMembroMaster(i) && (
                    <Badge tone="brand" className="whitespace-nowrap">
                      Membro Master
                    </Badge>
                  )}
                  {ehAluno(i) && <Badge tone="accent">Aluno</Badge>}
                  {ehNaoAluno(i) && (
                    <Badge tone="outline" className="whitespace-nowrap">
                      Não aluno
                    </Badge>
                  )}
                  {compradores.has(i.email) && <Badge tone="success">Comprou</Badge>}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ── Ficha individual ───────────────────────────────────────────────────

function Ficha({
  inscrito: i,
  vendas,
  abordagens,
  onRegistrar,
  onVoltar,
}: {
  inscrito: Inscrito;
  vendas: Venda[];
  abordagens: Abordagem[];
  onRegistrar: (observacao: string) => Promise<boolean>;
  onVoltar: () => void;
}) {
  const wa = linkWhatsapp(i.whatsapp);
  const ig = linkInstagram(i.extras.instagram);
  const secoes = fichaDoInscrito(i);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!texto.trim()) return;
    setSalvando(true);
    if (await onRegistrar(texto)) setTexto("");
    setSalvando(false);
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-2" onClick={onVoltar}>
        <ArrowLeft className="h-4 w-4" /> Todos os participantes
      </Button>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <ClasseSelo classe={i.classe} nota={i.nota} grande />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-medium leading-tight">{i.nome}</h2>
              <p className="num mt-1 break-all text-xs text-muted">{i.email}</p>
              {i.whatsapp && <p className="num text-xs text-muted">{i.whatsapp}</p>}
            </div>
          </div>

          {(wa || ig) && (
            <div className="mt-3 flex gap-2">
              {wa && (
                <Button variant="accent" full onClick={() => window.open(wa, "_blank", "noopener,noreferrer")}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
              )}
              {ig && (
                <Button variant="outline" full onClick={() => window.open(ig, "_blank", "noopener,noreferrer")}>
                  <Instagram className="h-4 w-4" /> Instagram
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Abordagem</SectionLabel>
          <Field label="O que foi conversado" hint="Fica registrado no seu nome, visível para o time.">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Resumo da conversa, objeções, próximo passo…"
            />
          </Field>
          <Button variant="accent" full className="mt-2" disabled={salvando || !texto.trim()} onClick={salvar}>
            <Send className="h-4 w-4" /> {salvando ? "Salvando..." : "Registrar abordagem"}
          </Button>

          {abordagens.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-border pt-3">
              {abordagens.map((a) => (
                <div key={a.id}>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{a.porNome}</span>
                    {" · "}
                    {new Date(a.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{a.observacao}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {vendas.length > 0 && (
        <Card className="mb-3 border-accent">
          <CardContent className="pt-4">
            <SectionLabel>Já comprou</SectionLabel>
            {vendas.map((v) => (
              <p key={v.id} className="mt-1 text-sm">
                <span className="num font-medium">{fmtVal(v.valor)}</span>
                <span className="text-muted"> · {v.closerNome}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Lead Score</SectionLabel>
          <div className="mt-2 flex gap-2">
            <Num valor={i.nota !== null ? String(i.nota) : "—"} rotulo="Nota" />
            <Num valor={i.perfil !== null ? String(i.perfil) : "—"} rotulo="Perfil" />
            <Num valor={i.comprometimento !== null ? String(i.comprometimento) : "—"} rotulo="Compromet." />
          </div>
          {i.classe === "X" && (
            <p className="mt-2 text-xs text-muted">Não respondeu o formulário de perfil — sem nota.</p>
          )}
        </CardContent>
      </Card>

      {/* Todas as respostas que vieram do painel, por assunto. */}
      {secoes.map((secao) => (
        <Card key={secao.titulo} className="mb-3">
          <CardContent className="pt-4">
            <SectionLabel>{secao.titulo}</SectionLabel>
            {secao.linhas.map((d, k) => (
              <Linha key={`${d.label}-${k}`} label={d.label} valor={d.valor} />
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  );
}

// ── Peças ──────────────────────────────────────────────────────────────

/** Chips de período, na ordem da tela (chaves de RECORTES em lib/periodos). */
const CHIPS_PERIODO: { valor: string; label: string }[] = [
  { valor: "p_d2m", label: "2º dia manhã" },
  { valor: "p_d2t", label: "2º dia tarde" },
  { valor: "p_d3m", label: "3º dia manhã" },
  { valor: "p_d3t", label: "3º dia tarde" },
  { valor: "c_d2t", label: "Só tarde (2º)" },
  { valor: "n_d2t", label: "Novos à tarde (2º)" },
];

/** Chips de dia: número e % no próprio chip; tocar no ativo desliga. */
function DiaChips<T extends string>({
  valor,
  onChange,
  opcoes,
  contagem,
  base,
}: {
  valor: T | "todos";
  onChange: (v: T | "todos") => void;
  opcoes: { valor: T; label: string }[];
  contagem: Record<string, number>;
  base: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        const n = contagem[o.valor];
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(ativo ? "todos" : o.valor)}
            className={`h-7 rounded-full border px-2.5 text-xs font-medium transition-colors ${
              ativo
                ? "border-foreground bg-foreground text-background"
                : "border-border-strong bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {o.label}
            <span className="num ml-1 font-normal opacity-80">
              {n}
              {base > 0 ? ` · ${Math.round((n / base) * 100)}%` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Grupo de chips exclusivos (um selecionado por vez), tamanho de toque. */
function Chips<T extends string>({
  valor,
  onChange,
  opcoes,
}: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; label: string }[];
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-border-strong">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(o.valor)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              ativo ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/**
 * Cores por classe — as MESMAS do painel de conversão (variáveis --AA…--X
 * do index.html), para o time reconhecer a classe de um sistema no outro.
 * Texto escuro nas cores claras, claro nas escuras.
 */
const COR: Record<Classe, { fundo: string; texto: string }> = {
  AA: { fundo: "#c9a35a", texto: "#1C1D18" },
  A: { fundo: "#e2c27e", texto: "#1C1D18" },
  B: { fundo: "#6fa8dc", texto: "#1C1D18" },
  C: { fundo: "#8fb7a3", texto: "#1C1D18" },
  D: { fundo: "#8d9bb3", texto: "#1C1D18" },
  E: { fundo: "#a58f6f", texto: "#FFFFFF" },
  F: { fundo: "#8d6b6b", texto: "#FFFFFF" },
  X: { fundo: "#5c6b78", texto: "#FFFFFF" },
};

/** Mesma legenda do painel ("ordem de ligação, não corte de qualidade"). */
const LEGENDA: Record<Classe, string> = {
  AA: "AA · Aluno no topo",
  A: "A · Topo 15%",
  B: "B · Alto 15–30%",
  C: "C · Médio-alto 30–50%",
  D: "D · Médio 50–70%",
  E: "E · Baixo 70–90%",
  F: "F · Últimos 10%",
  X: "X · Sem formulário",
};
const LEGENDA_CURTA: Record<Classe, string> = {
  AA: "aluno no topo",
  A: "topo 15%",
  B: "15–30%",
  C: "30–50%",
  D: "50–70%",
  E: "70–90%",
  F: "últimos 10%",
  X: "sem formulário",
};

function ClasseSelo({ classe, nota, grande }: { classe: Classe; nota: number | null; grande?: boolean }) {
  const cor = COR[classe];
  return (
    <span
      className={`flex shrink-0 items-center justify-center gap-1 rounded-full font-semibold ${
        grande ? "h-10 px-4 text-base" : "h-6 px-2.5 text-xs"
      }`}
      style={{ backgroundColor: cor.fundo, color: cor.texto }}
      title={`Lead Score ${classe}${nota !== null ? ` · ${nota}` : ""}`}
    >
      <span className="num leading-none">{classe}</span>
      {nota !== null && <span className="num leading-none opacity-80">{nota}</span>}
    </span>
  );
}

function Num({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="num text-base font-semibold text-accent">{valor}</div>
      <div className="eyebrow mt-0.5">{rotulo}</div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex gap-3 border-b border-border py-1.5 last:border-0">
      <span className="w-[42%] shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{valor}</span>
    </div>
  );
}
