"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_PROJETO_OFERTA } from "@/lib/consultas";
import { fmtVal } from "@/lib/config";
import { lerOferta, lerSck, removerSck } from "@/lib/links";
import type { Projeto, ProjetoOferta } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty } from "./ui/card";
import { Field, Input } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

/**
 * Catálogo-modelo de ofertas da Hotmart DO PROJETO. Só admin.
 *
 * É daqui que nascem os links de cada evento: uma oferta cadastrada num produto
 * só vai parar em evento daquele produto, porque a leitura é pelo `projeto_id`.
 * A URL fica guardada SEM `sck` — o token de cada vendedor é trocado na
 * hora de gerar os links do evento.
 */
export function CatalogoProjeto({ projeto, onClose }: { projeto: Projeto; onClose: () => void }) {
  const { toast, confirmar } = useFeedback();
  const [ofertas, setOfertas] = useState<ProjetoOferta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [adicionando, setAdicionando] = useState(false);

  const buscar = useCallback(async () => {
    const { data } = await supabase
      .from("projeto_ofertas")
      .select(SELECT_PROJETO_OFERTA)
      .eq("projeto_id", projeto.id)
      .order("ordem")
      .order("valor", { ascending: false, nullsFirst: false });
    setOfertas((data ?? []) as unknown as ProjetoOferta[]);
    setCarregando(false);
  }, [projeto.id]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  async function alternarAtivo(o: ProjetoOferta) {
    const { error } = await supabase
      .from("projeto_ofertas")
      .update({ ativo: !o.ativo })
      .eq("id", o.id);
    if (error) return toast("erro", "Não foi possível alterar.", error.message);
    buscar();
  }

  async function excluir(o: ProjetoOferta) {
    const ok = await confirmar({
      titulo: `Excluir a oferta ${o.oferta}?`,
      descricao:
        "Sai do catálogo do projeto. Os links já gerados nos eventos continuam como estão.",
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("projeto_ofertas").delete().eq("id", o.id);
    if (error) return toast("erro", "Não foi possível excluir.", error.message);
    toast("sucesso", "Oferta excluída do catálogo.");
    buscar();
  }

  if (adicionando) {
    return (
      <NovaOfertaDoProjeto
        projeto={projeto}
        onPronto={() => {
          setAdicionando(false);
          buscar();
        }}
        onClose={() => setAdicionando(false)}
      />
    );
  }

  return (
    <Sheet
      titulo={
        <span className="flex items-center gap-2">
          <span
            className="num inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[10px] font-bold text-white"
            style={{ background: projeto.cor }}
          >
            {projeto.sigla}
          </span>
          Catálogo de ofertas
        </span>
      }
      onClose={onClose}
      rodape={
        <Button size="lg" full onClick={() => setAdicionando(true)}>
          <Plus className="h-5 w-5" /> Nova oferta no catálogo
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Ofertas da Hotmart de <strong className="text-foreground">{projeto.nome}</strong>. Todo
        evento novo deste projeto gera os links do time a partir daqui — e só daqui.
      </p>

      <div className="my-4 h-px bg-border" />

      {carregando ? (
        <Empty>Carregando...</Empty>
      ) : !ofertas.length ? (
        <Empty>
          Nenhuma oferta no catálogo ainda.
          <br />
          <span className="text-xs">Cole a URL de cada oferta da Hotmart deste projeto.</span>
        </Empty>
      ) : (
        ofertas.map((o) => (
          <div key={o.id} className="border-b border-border py-3 last:border-0">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="num text-sm font-semibold text-accent">
                {o.valor ? fmtVal(o.valor) : o.oferta}
              </span>
              <span className="flex items-center gap-2">
                {o.condicao && (
                  <span className="text-xs text-muted-foreground">{o.condicao}</span>
                )}
                <Badge tone={o.ativo ? "success" : "neutral"}>{o.ativo ? "ativa" : "pausada"}</Badge>
              </span>
            </div>
            <p className="num mb-0.5 text-[11px] text-muted-foreground">off: {o.oferta}</p>
            <p className="mb-2 break-all text-[11px] text-muted-foreground">{o.url}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => alternarAtivo(o)}>
                {o.ativo ? "Pausar" : "Reativar"}
              </Button>
              <Button
                variant="danger-outline"
                size="icon-sm"
                aria-label="Excluir oferta"
                onClick={() => excluir(o)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Pausar uma oferta tira ela dos próximos eventos sem apagar o cadastro. Para mudar o link de
        um evento que já existe, use <strong>Links → Gerir</strong> dentro do evento.
      </p>
    </Sheet>
  );
}

// ── Nova oferta no catálogo ─────────────────────────────────────────────

function NovaOfertaDoProjeto({
  projeto,
  onPronto,
  onClose,
}: {
  projeto: Projeto;
  onPronto: () => void;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const [url, setUrl] = useState("");
  const [oferta, setOferta] = useState("");
  const [ofertaManual, setOfertaManual] = useState(false);
  const [valor, setValor] = useState("");
  const [condicao, setCondicao] = useState("");
  const [busy, setBusy] = useState(false);

  // O código da oferta está na própria URL colada (mesmo motivo de
  // GerirLinks: digitar de novo é chance de cadastrar a mesma oferta duas vezes).
  useEffect(() => {
    if (ofertaManual) return;
    setOferta(lerOferta(url) ?? "");
  }, [url, ofertaManual]);

  const limpa = url.trim();
  const tokenNaUrl = limpa ? lerSck(limpa) : null;
  const molde = limpa ? removerSck(limpa) : "";

  async function salvar() {
    if (!limpa) return toast("aviso", "Cole a URL da oferta.");
    if (!/^https?:\/\//i.test(limpa)) return toast("aviso", "A URL precisa começar com https://");
    if (!oferta.trim()) {
      return toast(
        "aviso",
        "Não achei o código da oferta na URL.",
        "Preencha o campo à mão — é o que separa uma oferta da outra."
      );
    }

    setBusy(true);
    // Sempre SEM sck: o molde não tem dono. O token de cada vendedor entra
    // só na hora de gerar os links do evento.
    const { error } = await supabase.from("projeto_ofertas").upsert(
      {
        projeto_id: projeto.id,
        oferta: oferta.trim(),
        url: molde,
        valor: valor ? parseFloat(valor.replace(",", ".")) : null,
        condicao: condicao.trim() || null,
        ativo: true,
      },
      { onConflict: "projeto_id,oferta" }
    );

    if (error) {
      setBusy(false);
      return toast("erro", "Não foi possível salvar.", error.message);
    }

    toast("sucesso", `Oferta ${oferta.trim()} no catálogo de ${projeto.nome}.`);
    onPronto();
  }

  return (
    <Sheet
      titulo="Nova oferta no catálogo"
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={salvar}>
          {busy ? "Salvando..." : "Adicionar ao catálogo"}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Cole a URL da oferta como está na Hotmart. O token de rastreio de quem estiver nela é
        removido — o catálogo é o molde, e cada vendedor recebe o seu na hora de gerar os links do
        evento.
      </p>

      <div className="my-4 h-px bg-border" />

      <Field label="URL da oferta na Hotmart">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://pay.hotmart.com/..."
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>

      <Field
        label="Código da oferta"
        hint={
          ofertaManual
            ? "Preenchido à mão."
            : oferta
              ? "Lido da URL automaticamente."
              : "Aparece sozinho quando a URL tiver off=."
        }
      >
        <Input
          value={oferta}
          onChange={(e) => {
            setOfertaManual(true);
            setOferta(e.target.value);
          }}
          placeholder="Ex: hrbkppf0"
          autoCapitalize="off"
        />
      </Field>

      <div className="flex gap-2">
        <Field label="Valor (R$)" className="flex-1">
          <Input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Condição" className="flex-[2]">
          <Input
            value={condicao}
            onChange={(e) => setCondicao(e.target.value)}
            placeholder="Ex: Parcelado 12x"
          />
        </Field>
      </div>

      {molde && (
        <div className="rounded-lg border border-border tint p-3">
          <p className="eyebrow mb-1.5">Como fica no catálogo</p>
          <p className="break-all text-[11px] text-muted-foreground">{molde}</p>
          {tokenNaUrl && (
            <p className="mt-1.5 text-[11px] text-warning">
              O token <strong>{tokenNaUrl}</strong> que veio na URL foi removido.
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Se a oferta já existir no catálogo deste projeto, ela é atualizada em vez de duplicar.
      </p>
    </Sheet>
  );
}
