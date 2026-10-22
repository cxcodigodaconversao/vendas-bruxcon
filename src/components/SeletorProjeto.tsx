"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, Link2, LogOut, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { FAIXAS_PADRAO, PAPEL_LABEL, REGRAS_PADRAO, corFraca } from "@/lib/config";
import type { Projeto, Usuario } from "@/lib/types";
import { CatalogoProjeto } from "./CatalogoProjeto";
import { Logo } from "./Logo";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty } from "./ui/card";
import { Field, Input, Select, Textarea } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

/**
 * Primeira tela depois do login: de qual produto da Bruxcon é o trabalho de
 * hoje. Cada produto (DTC Master…) tem eventos, regras e links da Hotmart próprios,
 * e a escolha aqui é o que separa um do outro no resto do app.
 *
 * Tela cheia, não folha: é uma decisão que muda tudo o que vem depois, e
 * não um ajuste no meio do caminho.
 */
export function SeletorProjeto({
  projetos,
  atual,
  perfil,
  onSelecionar,
  onVoltar,
}: {
  projetos: Projeto[];
  atual: Projeto | null;
  perfil: Usuario;
  onSelecionar: (id: string) => void;
  /** Presente quando já havia um projeto escolhido (veio pelo menu). */
  onVoltar?: () => void;
}) {
  const isAdmin = perfil.papel === "admin";
  const [editando, setEditando] = useState<Projeto | null>(null);
  const [criando, setCriando] = useState(false);
  const [catalogo, setCatalogo] = useState<Projeto | null>(null);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5">
        {onVoltar ? (
          <button
            aria-label="Voltar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            onClick={onVoltar}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Logo size={30} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">DTC Master</span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {perfil.nome} · {PAPEL_LABEL[perfil.papel]}
          </span>
        </span>
        <button
          aria-label="Sair"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 p-3" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>
        <p className="eyebrow mb-1 mt-2">DTC Master</p>
        <h1 className="display mb-4 text-2xl leading-tight">Em qual projeto você vai trabalhar?</h1>

        {!projetos.length ? (
          <Empty>
            Nenhum projeto cadastrado.
            {isAdmin ? (
              <>
                <br />
                <span className="text-xs">Crie o primeiro no botão abaixo.</span>
              </>
            ) : (
              <>
                <br />
                <span className="text-xs">Peça a um administrador para cadastrar.</span>
              </>
            )}
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {projetos.map((p) => {
              const selecionado = p.id === atual?.id;
              return (
                <div
                  key={p.id}
                  className="flex items-stretch gap-1 rounded-xl border border-border bg-card card-elev"
                  style={selecionado ? { borderColor: p.cor } : undefined}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                    onClick={() => onSelecionar(p.id)}
                  >
                    <span
                      className="num flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-xs font-bold tracking-wide text-white"
                      style={{ background: p.cor }}
                    >
                      {p.sigla}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-tight">
                        {p.nome}
                      </span>
                      {p.mentor && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.mentor}
                        </span>
                      )}
                      {selecionado && (
                        <span className="mt-1 inline-block">
                          <Badge tone="accent">atual</Badge>
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>

                  {isAdmin && (
                    <div className="flex flex-col justify-center gap-1 border-l border-border px-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Catálogo de ofertas de ${p.nome}`}
                        title="Catálogo de ofertas (Hotmart)"
                        onClick={() => setCatalogo(p)}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${p.nome}`}
                        onClick={() => setEditando(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && (
          <Button
            variant="outline"
            size="lg"
            full
            className="mt-4"
            onClick={() => setCriando(true)}
          >
            <Plus className="h-5 w-5" /> Novo projeto
          </Button>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Cada projeto tem os próprios eventos, produtos e links de pagamento. O que é de um nunca
          aparece no outro.
        </p>
      </main>

      {(criando || editando) && (
        <FormProjeto
          projeto={editando}
          perfil={perfil}
          onClose={() => {
            setCriando(false);
            setEditando(null);
          }}
        />
      )}

      {catalogo && <CatalogoProjeto projeto={catalogo} onClose={() => setCatalogo(null)} />}
    </div>
  );
}

// ── Cadastro / edição do projeto ────────────────────────────────────────

const CORES_SUGERIDAS = [
  { nome: "Verde Bruxcon", cor: "#1A8A45" },
  { nome: "Oceano", cor: "#0B3C5D" },
  { nome: "Roxo", cor: "#7E22CE" },
  { nome: "Esmeralda", cor: "#0E5A5C" },
  { nome: "Grafite", cor: "#33404D" },
  { nome: "Vinho", cor: "#7F1D1D" },
  { nome: "Âmbar", cor: "#92400E" },
];

function FormProjeto({
  projeto,
  perfil,
  onClose,
}: {
  projeto: Projeto | null;
  perfil: Usuario;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const editando = !!projeto;

  const [nome, setNome] = useState(projeto?.nome ?? "");
  const [sigla, setSigla] = useState(projeto?.sigla ?? "");
  const [cor, setCor] = useState(projeto?.cor ?? "#0B3C5D");
  const [mentor, setMentor] = useState(projeto?.mentor ?? "");
  const [descricao, setDescricao] = useState(projeto?.descricao ?? "");
  const [produto, setProduto] = useState(projeto?.produtos?.[0]?.nome ?? "");
  const [ativo, setAtivo] = useState(projeto?.ativo ?? true);
  const [busy, setBusy] = useState(false);

  const corValida = /^#[0-9a-f]{6}$/i.test(cor);

  function slugDe(texto: string) {
    return texto
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function salvar() {
    if (!nome.trim()) return toast("aviso", "Dê um nome ao projeto.");
    const siglaLimpa = sigla.trim().toUpperCase();
    if (!siglaLimpa || siglaLimpa.length > 4) {
      return toast("aviso", "A sigla precisa ter de 1 a 4 letras.");
    }
    if (!corValida) return toast("aviso", "A cor precisa estar no formato #RRGGBB.");
    if (!produto.trim()) return toast("aviso", "Informe o nome do produto principal.");

    // Produto principal: em projeto novo, nasce a lista; em edição, só o
    // nome do primeiro muda — os demais produtos do catálogo ficam como estão.
    const produtos = editando
      ? projeto!.produtos.length
        ? [{ ...projeto!.produtos[0], nome: produto.trim() }, ...projeto!.produtos.slice(1)]
        : [{ id: slugDe(produto), nome: produto.trim() }]
      : [{ id: slugDe(produto), nome: produto.trim() }];

    const dados = {
      nome: nome.trim(),
      slug: slugDe(nome),
      sigla: siglaLimpa,
      cor: cor.toUpperCase(),
      mentor: mentor.trim() || null,
      descricao: descricao.trim() || null,
      ativo,
      produtos,
    };

    setBusy(true);
    const { error } = editando
      ? await supabase.from("projetos").update(dados).eq("id", projeto!.id)
      : await supabase.from("projetos").insert({
          ...dados,
          // Faixas e regras começam iguais às do DTC Master; ajuste na tela de
          // pontuação do evento se este projeto pontuar diferente.
          faixas: FAIXAS_PADRAO,
          regras: REGRAS_PADRAO,
          ordem: 99,
          criado_por: perfil.email,
        });

    if (error) {
      setBusy(false);
      return toast(
        "erro",
        "Não foi possível salvar o projeto.",
        error.message.includes("projetos_slug_key")
          ? "Já existe um projeto com esse nome."
          : error.message
      );
    }

    toast(
      "sucesso",
      editando ? "Projeto atualizado." : "Projeto criado.",
      editando ? undefined : "Agora cadastre o catálogo de ofertas da Hotmart dele (ícone de link)."
    );
    onClose();
  }

  return (
    <Sheet
      titulo={editando ? "Editar projeto" : "Novo projeto"}
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={salvar}>
          {busy ? "Salvando..." : editando ? "Salvar alterações" : "Criar projeto"}
        </Button>
      }
    >
      <Field label="Nome do projeto">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: DTC Master" />
      </Field>

      <div className="flex gap-2">
        <Field label="Sigla" hint="Até 4 letras. Vai no logo." className="w-28">
          <Input
            value={sigla}
            maxLength={4}
            onChange={(e) => setSigla(e.target.value.toUpperCase())}
            placeholder="DTC"
            autoCapitalize="characters"
          />
        </Field>
        <Field label="Mentor" className="flex-1">
          <Input value={mentor} onChange={(e) => setMentor(e.target.value)} placeholder="Ex: Dr. Felipe" />
        </Field>
      </div>

      <Field label="Cor da identidade" hint="Muda a cor do app quando o projeto está selecionado.">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={corValida ? cor : "#000000"}
            onChange={(e) => setCor(e.target.value.toUpperCase())}
            aria-label="Escolher cor"
            className="h-12 w-14 shrink-0 cursor-pointer rounded-md border border-border-strong bg-card p-1"
          />
          <Input
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            placeholder="#7E22CE"
            autoCapitalize="characters"
            className="num"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CORES_SUGERIDAS.map((c) => (
            <button
              key={c.cor}
              type="button"
              onClick={() => setCor(c.cor)}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
              style={
                cor.toUpperCase() === c.cor
                  ? { borderColor: c.cor, background: corFraca(c.cor) }
                  : undefined
              }
            >
              <span className="h-3 w-3 rounded-full" style={{ background: c.cor }} />
              {c.nome}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label="Produto principal"
        hint="Nome que aparece na venda. Novo evento do projeto já nasce com ele."
      >
        <Input
          value={produto}
          onChange={(e) => setProduto(e.target.value)}
          placeholder="Ex: Formação DTC Master"
        />
      </Field>

      <Field label="Descrição (opcional)">
        <Textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Uma linha sobre o projeto"
          rows={2}
        />
      </Field>

      {editando && (
        <Field label="Situação" hint="Projeto inativo some da escolha, mas os eventos dele continuam no banco.">
          <Select value={ativo ? "sim" : "nao"} onChange={(e) => setAtivo(e.target.value === "sim")}>
            <option value="sim">Ativo</option>
            <option value="nao">Inativo</option>
          </Select>
        </Field>
      )}
    </Sheet>
  );
}
