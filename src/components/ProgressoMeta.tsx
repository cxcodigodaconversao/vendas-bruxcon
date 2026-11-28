"use client";

import { useMemo } from "react";
import { Target, TrendingUp } from "lucide-react";
import { fmtPts, fmtVal } from "@/lib/config";
import type { Evento, MetricaMeta, Venda } from "@/lib/types";
import { Card, CardContent } from "./ui/card";

const ROTULO: Record<MetricaMeta, string> = {
  faturamento: "faturamento",
  recebido: "recebido",
  vendas: "vendas",
  pontos: "pontos",
};

function medir(vendas: Venda[], metrica: MetricaMeta): number {
  switch (metrica) {
    case "faturamento":
      return vendas.reduce((a, v) => a + (v.valor || 0), 0);
    case "recebido":
      return vendas.reduce((a, v) => a + (v.recebido || 0), 0);
    case "vendas":
      return vendas.length;
    case "pontos":
      return vendas.reduce((a, v) => a + (v.pts || 0), 0);
  }
}

/**
 * Curva de conversão de um evento: a venda acontece nos 2 últimos dias.
 * No 1º dia de conversão entra ~30% do total; no 2º, ~70%. Ritmo linear
 * (vendido ÷ dias passados × dias do evento) erra feio nessa curva.
 */
const CURVA_CONVERSAO = [0.3, 0.7];

/** Dia da venda no fuso de Brasília (YYYY-MM-DD). */
const diaBR = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const diaDaVenda = (v: Venda) => v.dataVenda || diaBR(v.criadoEm);

/** Lista os dias YYYY-MM-DD de inicio até fim. */
function diasDoEvento(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const d = new Date(inicio + "T12:00:00Z");
  const ultimo = new Date(fim + "T12:00:00Z");
  while (d <= ultimo && dias.length < 60) {
    dias.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

/**
 * Projeção de fechamento pela curva de conversão.
 * · Antes dos dias de conversão: sem projeção.
 * · 1º dia de conversão: vendido ÷ 30%.
 * · 2º dia: o 1º dia continua valendo 30% do total; se o 2º já passou do
 *   esperado, a projeção acompanha o que entrou de fato.
 */
function projetar(
  vendas: Venda[],
  metrica: MetricaMeta,
  inicio: string | null,
  fim: string | null
): number | null {
  if (!inicio || !fim) return null;
  const dias = diasDoEvento(inicio, fim);
  const curva = dias.length >= CURVA_CONVERSAO.length ? CURVA_CONVERSAO : [1];
  const conversao = dias.slice(-curva.length);
  const hoje = diaBR(new Date().toISOString());
  const idx = conversao.indexOf(hoje);
  if (idx < 0) return null; // fora dos dias de conversão

  const atual = medir(vendas, metrica);
  if (idx === 0) return atual / curva[0];

  // 2º dia: o que entrou nos dias anteriores de conversão projeta o total.
  const anteriores = conversao.slice(0, idx);
  const fatiaAnterior = curva.slice(0, idx).reduce((a, b) => a + b, 0);
  const vendidoAntes = medir(
    vendas.filter((v) => diaDaVenda(v) <= anteriores[anteriores.length - 1]),
    metrica
  );
  return Math.max(atual, vendidoAntes / fatiaAnterior);
}

const formatar = (n: number, m: MetricaMeta) =>
  m === "vendas" ? String(n) : m === "pontos" ? fmtPts(n) : fmtVal(n);

/**
 * Progresso da meta do evento.
 *
 * A porcentagem sozinha não ajuda ninguém em campo: o time precisa do GAP
 * (quanto falta, em dinheiro) e do RITMO (se mantiver assim, fecha em quanto).
 * É isso que transforma a meta em decisão durante o evento, não em placar.
 */
export function ProgressoMeta({ evento, vendas }: { evento: Evento; vendas: Venda[] }) {
  const meta = evento.metas?.find((m) => m.escopo === "evento");

  const dados = useMemo(() => {
    if (!meta) return null;
    const atual = medir(vendas, meta.metrica);
    const pct = meta.valor > 0 ? Math.min(100, Math.round((atual / meta.valor) * 100)) : 0;
    const gap = Math.max(0, meta.valor - atual);

    const projecao = projetar(vendas, meta.metrica, evento.dataInicio, evento.dataFim);

    return { atual, pct, gap, projecao, batida: atual >= meta.valor };
  }, [meta, vendas, evento.dataInicio, evento.dataFim]);

  if (!meta || !dados) return null;

  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="eyebrow flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Meta de {ROTULO[meta.metrica]}
          </span>
          <span className="num text-sm font-semibold">
            {dados.pct}%
          </span>
        </div>

        <div className="num flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-accent">
            {formatar(dados.atual, meta.metrica)}
          </span>
          <span className="text-sm text-muted-foreground">
            de {formatar(meta.valor, meta.metrica)}
          </span>
        </div>

        <div className="mt-2.5 h-2 rounded-full bg-muted">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${dados.pct}%`,
              background: dados.batida ? "var(--success)" : "var(--accent)",
            }}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {dados.batida ? (
            <span className="font-medium text-success">Meta batida.</span>
          ) : (
            <span className="text-muted-foreground">
              Faltam{" "}
              <strong className="num font-medium text-foreground">
                {formatar(dados.gap, meta.metrica)}
              </strong>
            </span>
          )}

          {dados.projecao !== null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Projeção de fechamento{" "}
              <strong className="num font-medium text-foreground">
                {formatar(Math.round(dados.projecao), meta.metrica)}
              </strong>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
