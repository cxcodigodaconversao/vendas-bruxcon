"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_PROJETO_OFERTA } from "@/lib/consultas";
import { FAIXAS_PADRAO, PRODUTOS_PADRAO, REGRAS_PADRAO, fmtData } from "@/lib/config";
import type {
  CriterioDesempate,
  Evento,
  Projeto,
  ProjetoOferta,
  StatusEvento,
  Usuario,
} from "@/lib/types";
import { ImportarParticipantes } from "./ImportarParticipantes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty } from "./ui/card";
import { Field, Input, Select } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

const STATUS: { valor: StatusEvento; label: string }[] = [
  { valor: "rascunho", label: "Rascunho" },
  { valor: "ativo", label: "Ativo" },
  { valor: "encerrado", label: "Encerrado" },
  { valor: "arquivado", label: "Arquivado" },
];

const TOM_STATUS = {
  ativo: "success",
  rascunho: "warning",
  encerrado: "neutral",
  arquivado: "neutral",
} as const;

/**
 * Eventos DO PROJETO selecionado. A lista já chega filtrada pelo
 * useEventos; aqui o projeto entra para dar cor, nome e os padrões de um
 * evento novo (produto, faixas, regras e catálogo de links).
 */
export function SeletorEvento({
  projeto,
  eventos,
  atual,
  podeGerir,
  perfil,
  onSelecionar,
  onClose,
}: {
  projeto: Projeto;
  eventos: Evento[];
  atual: Evento;
  podeGerir: boolean;
  perfil: Usuario;
  onSelecionar: (id: string) => void;
  onClose: () => void;
}) {
  const [editando, setEditando] = useState<Evento | null>(null);
  const [criando, setCriando] = useState(false);
  const [importando, setImportando] = useState<Evento | null>(null);

  if (importando) {
    return <ImportarParticipantes evento={importando} onClose={() => setImportando(null)} />;
  }

  if (criando || editando) {
    return (
      <FormEvento
        projeto={projeto}
        evento={editando}
        perfil={perfil}
        onClose={() => {
          setCriando(false);
          setEditando(null);
        }}
      />
    );
  }

  return (
    <Sheet
      titulo={`Eventos · ${projeto.sigla}`}
      onClose={onClose}
      rodape={
        podeGerir ? (
          <Button size="lg" full onClick={() => setCriando(true)}>
            <Plus className="h-5 w-5" /> Novo evento
          </Button>
        ) : undefined
      }
    >
      {!eventos.length ? (
        <Empty>
          Nenhum evento de {projeto.nome} ainda.
          {podeGerir && (
            <>
              <br />
              <span className="text-xs">Crie o primeiro no botão abaixo.</span>
            </>
          )}
        </Empty>
      ) : (
        eventos.map((e) => {
          const selecionado = e.id === atual.id;
          return (
            <div
              key={e.id}
              className="flex items-center gap-2 border-b border-border py-3 last:border-0"
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => onSelecionar(e.id)}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: projeto.cor }}
                  />
                  <span className="truncate text-[15px] font-medium">{e.nome}</span>
                  {selecionado && <Check className="h-4 w-4 shrink-0 text-accent" />}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone={TOM_STATUS[e.status]}>{e.status}</Badge>
                  <span className="num text-xs text-muted-foreground">
                    {fmtData(e.dataInicio)}
                    {e.dataFim && e.dataFim !== e.dataInicio && ` – ${fmtData(e.dataFim)}`}
                  </span>
                  {e.cidade && (
                    <span className="text-xs text-muted-foreground">
                      {e.cidade}
                      {e.uf && `/${e.uf}`}
                    </span>
                  )}
                </div>
              </button>

              {podeGerir && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Importar participantes de ${e.nome}`}
                    title="Importar participantes"
                    onClick={() => setImportando(e)}
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${e.nome}`}
                    onClick={() => setEditando(e)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          );
        })
      )}
    </Sheet>
  );
}

// ── Cadastro / edição do evento ─────────────────────────────────────────

function FormEvento({
  projeto,
  evento,
  perfil,
  onClose,
}: {
  projeto: Projeto;
  evento: Evento | null;
  perfil: Usuario;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const editando = !!evento;

  const [nome, setNome] = useState(evento?.nome ?? "");
  const [cidade, setCidade] = useState(evento?.cidade ?? "");
  const [uf, setUf] = useState(evento?.uf ?? "");
  const [dataInicio, setDataInicio] = useState(evento?.dataInicio ?? "");
  const [dataFim, setDataFim] = useState(evento?.dataFim ?? "");
  const [status, setStatus] = useState<StatusEvento>(evento?.status ?? "rascunho");
  const [desempate, setDesempate] = useState<CriterioDesempate>(evento?.desempate ?? "recebido");
  const [linkAnalise, setLinkAnalise] = useState(evento?.linkAnalise ?? "");
  const [linkContratos, setLinkContratos] = useState(evento?.linkContratos ?? "");
  const [metaFaturamento, setMetaFaturamento] = useState(
    String(evento?.metas?.find((m) => m.escopo === "evento")?.valor ?? "")
  );
  const [busy, setBusy] = useState(false);

  // Catálogo do PROJETO: em evento novo, o banco gera os links do time a
  // partir daqui sozinho (gatilho da migração 0010) — Casa + todo vendedor
  // ativo, com o token de cada um. Aqui é só para mostrar o que vai entrar.
  const [catalogo, setCatalogo] = useState<ProjetoOferta[]>([]);
  useEffect(() => {
    if (editando) return;
    supabase
      .from("projeto_ofertas")
      .select(SELECT_PROJETO_OFERTA)
      .eq("projeto_id", projeto.id)
      .eq("ativo", true)
      .then(({ data }) => setCatalogo((data ?? []) as unknown as ProjetoOferta[]));
  }, [editando, projeto.id]);

  async function salvar() {
    if (!nome.trim()) return toast("aviso", "Dê um nome ao evento.");
    if (!dataInicio) return toast("aviso", "Informe a data de início.");
    if (dataFim && dataFim < dataInicio) {
      return toast("aviso", "A data de fim não pode ser antes da data de início.");
    }

    const meta = parseFloat(metaFaturamento) || 0;
    const metas =
      meta > 0
        ? [{ id: "meta-evento", escopo: "evento", metrica: "faturamento", valor: meta }]
        : [];

    const dados = {
      nome: nome.trim(),
      slug: nome
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") // tira acento: o slug é chave única dentro do projeto
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      cidade: cidade.trim() || null,
      uf: uf.trim().toUpperCase() || null,
      data_inicio: dataInicio,
      data_fim: dataFim || dataInicio,
      status,
      desempate,
      metas,
      link_analise: linkAnalise.trim() || null,
      link_contratos: linkContratos.trim().replace(/\/+$/, "") || null,
    };

    setBusy(true);

    if (editando) {
      // Não toca em produtos, faixas, regras nem projeto: os três primeiros
      // são editados na tela própria de pontuação, e o projeto é fixo —
      // mover um evento levaria os links do catálogo errado junto.
      const { error } = await supabase.from("eventos").update(dados).eq("id", evento!.id);
      if (error) {
        setBusy(false);
        return toast("erro", "Não foi possível salvar o evento.", traduzir(error.message));
      }
      toast("sucesso", "Evento atualizado.");
      return onClose();
    }

    // Evento novo: nasce com os padrões DO PROJETO. Só cai no padrão do app
    // (que é o do DTC Master) se o projeto não tiver configuração.
    const { error } = await supabase
      .from("eventos")
      .insert({
        ...dados,
        projeto_id: projeto.id,
        produtos: projeto.produtos?.length ? projeto.produtos : PRODUTOS_PADRAO,
        faixas: projeto.faixas?.length ? projeto.faixas : FAIXAS_PADRAO,
        regras: projeto.regras?.length ? projeto.regras : REGRAS_PADRAO,
        criado_por: perfil.email,
      });

    if (error) {
      setBusy(false);
      return toast("erro", "Não foi possível salvar o evento.", traduzir(error.message));
    }

    toast(
      "sucesso",
      "Evento criado.",
      catalogo.length
        ? `Links da Hotmart gerados do catálogo de ${projeto.nome} para todo o time.`
        : `Ele nasce com o produto e a pontuação de ${projeto.nome}. O catálogo está vazio — sem links por enquanto.`
    );
    onClose();
  }

  function traduzir(mensagem: string) {
    return mensagem.includes("eventos_projeto_slug_key") || mensagem.includes("eventos_slug_key")
      ? "Já existe um evento com esse nome neste projeto."
      : mensagem;
  }

  return (
    <Sheet
      titulo={editando ? "Editar evento" : "Novo evento"}
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={salvar}>
          {busy ? "Salvando..." : editando ? "Salvar alterações" : "Criar evento"}
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border tint-brand p-3">
        <span
          className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
          style={{ background: projeto.cor }}
        >
          {projeto.sigla}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{projeto.nome}</span>
          <span className="block text-[11px] text-muted-foreground">
            {editando ? "O projeto do evento não muda." : "O evento será criado neste projeto."}
          </span>
        </span>
      </div>

      <Field label="Nome do evento">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={`Ex: Imersão ${projeto.sigla} 2026`}
        />
      </Field>

      <div className="flex gap-2">
        <Field label="Cidade" className="flex-1">
          <Input
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="São Paulo"
          />
        </Field>
        <Field label="UF" className="w-20">
          <Input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value)} placeholder="SP" />
        </Field>
      </div>

      <div className="flex gap-2">
        <Field label="Início" className="flex-1">
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </Field>
        <Field label="Fim" className="flex-1">
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </Field>
      </div>

      <Field label="Situação">
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusEvento)}>
          {STATUS.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Meta de faturamento (R$)"
        hint="Aparece no ranking com o quanto falta e a projeção de fechamento."
      >
        <Input
          type="number"
          inputMode="decimal"
          value={metaFaturamento}
          onChange={(e) => setMetaFaturamento(e.target.value)}
          placeholder="0"
        />
      </Field>

      <Field label="Critério de desempate" hint="Usado quando duas pessoas empatam em pontos.">
        <Select
          value={desempate}
          onChange={(e) => setDesempate(e.target.value as CriterioDesempate)}
        >
          <option value="recebido">Maior valor recebido</option>
          <option value="valor">Maior volume vendido</option>
          <option value="vendas">Maior número de vendas</option>
          <option value="primeiro_a_atingir">Quem pontuou primeiro</option>
        </Select>
      </Field>

      <Field
        label="Link do painel de análise (opcional)"
        hint="URL do dashboard externo (Lead Score, check-in etc). Aparece como atalho no menu ☰ para quem vê o evento inteiro."
      >
        <Input
          type="url"
          value={linkAnalise}
          onChange={(e) => setLinkAnalise(e.target.value)}
          placeholder="https://..."
        />
      </Field>

      <Field
        label="Link do sistema de contratos (opcional)"
        hint="URL base do app de assinatura, sem /novo. Preenchido, o botão Contrato de cada venda abre lá o formulário já com os dados da venda."
      >
        <Input
          type="url"
          value={linkContratos}
          onChange={(e) => setLinkContratos(e.target.value)}
          placeholder="https://seudominio.com.br/assinatura"
        />
      </Field>

      {!editando && (
        <div className="mt-2 rounded-lg border border-border tint p-3">
          <p className="eyebrow mb-1.5">Links da Hotmart</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {catalogo.length ? (
              <>
                Ao criar, o evento recebe as{" "}
                <strong className="text-foreground">{catalogo.length} ofertas</strong> do catálogo
                de {projeto.nome}, para a casa e para cada vendedor ativo com o token dele. Depois,
                quem entrar no time recebe os links sozinho.
              </>
            ) : (
              <>
                O catálogo de {projeto.nome} está vazio — o evento nasce sem links. Cadastre as
                ofertas em <strong>Trocar projeto → ícone de link</strong>; cada oferta nova entra
                neste evento automaticamente.
              </>
            )}
          </p>
        </div>
      )}
    </Sheet>
  );
}
