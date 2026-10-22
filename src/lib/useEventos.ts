"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase/cliente";
import { SELECT_EVENTO } from "./consultas";
import { FAIXAS_PADRAO, PRODUTOS_PADRAO, REGRAS_PADRAO } from "./config";
import { useNomeDeCanal } from "./canal";
import type { Evento, Projeto, Usuario } from "./types";

// A escolha é POR PROJETO: quem alterna entre produtos volta para o
// evento em que estava em cada um, em vez de cair sempre no mais recente.
const chaveSelecao = (projetoId: string) => `ava:evento-selecionado:${projetoId}`;

/**
 * Evento de emergência: usado só enquanto o projeto não tiver evento.
 * Carrega os padrões do projeto para o app não ficar inutilizável — mas o
 * id é falso, então o registro de venda fica bloqueado (a chave estrangeira
 * recusaria de qualquer forma).
 */
export function eventoProvisorio(projeto: Projeto | null): Evento {
  return {
    id: "",
    projetoId: projeto?.id ?? "",
    nome: "Nenhum evento cadastrado",
    slug: "sem-evento",
    marca: "TUBAROES",
    cidade: null,
    uf: null,
    local: null,
    dataInicio: "",
    dataFim: "",
    status: "rascunho",
    produtos: projeto?.produtos?.length ? projeto.produtos : PRODUTOS_PADRAO,
    faixas: projeto?.faixas?.length ? projeto.faixas : FAIXAS_PADRAO,
    regras: projeto?.regras?.length ? projeto.regras : REGRAS_PADRAO,
    metas: [],
    desempate: "recebido",
    linkAnalise: null,
    linkContratos: null,
    criadoEm: "",
  };
}

/**
 * Eventos DO PROJETO selecionado. Um evento de outro produto nunca aparece quando o
 * projeto escolhido é o DTC Master — é esse filtro que garante que os links,
 * as vendas e o ranking de um não vazem para o outro.
 */
export function useEventos(perfil: Usuario | null, projeto: Projeto | null) {
  const projetoId = projeto?.id ?? null;
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const canalNome = useNomeDeCanal("eventos");

  const buscar = useCallback(async () => {
    if (!projetoId) {
      setEventos([]);
      setCarregando(false);
      return;
    }
    const { data, error } = await supabase
      .from("eventos")
      .select(SELECT_EVENTO)
      .eq("projeto_id", projetoId)
      .order("data_inicio", { ascending: false });
    if (!error) setEventos((data ?? []) as unknown as Evento[]);
    setCarregando(false);
  }, [projetoId]);

  useEffect(() => {
    if (!perfil) return;
    setCarregando(true);
    buscar();

    const canal = supabase
      .channel(`${canalNome}:${projetoId ?? "nenhum"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, () => buscar())
      .subscribe();

    return () => {
      canal.unsubscribe();
    };
  }, [perfil, projetoId, buscar, canalNome]);

  // Restaura a última escolha DESTE projeto: o vendedor não deve reescolher
  // o evento a cada vez que abre o app no meio do salão.
  useEffect(() => {
    if (typeof window === "undefined" || !projetoId) return;
    setSelecionado(localStorage.getItem(chaveSelecao(projetoId)));
  }, [projetoId]);

  const selecionar = useCallback(
    (id: string) => {
      setSelecionado(id);
      if (projetoId) localStorage.setItem(chaveSelecao(projetoId), id);
    },
    [projetoId]
  );

  const evento = useMemo(() => {
    if (!eventos.length) return eventoProvisorio(projeto);
    return (
      eventos.find((e) => e.id === selecionado) ??
      // Sem escolha salva, cai no evento ativo mais recente.
      eventos.find((e) => e.status === "ativo") ??
      eventos[0]
    );
  }, [eventos, selecionado, projeto]);

  return {
    eventos,
    evento,
    semEventos: !carregando && !eventos.length,
    carregando,
    selecionar,
    recarregar: buscar,
  };
}
