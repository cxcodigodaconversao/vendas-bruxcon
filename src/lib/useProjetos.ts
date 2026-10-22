"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase/cliente";
import { SELECT_PROJETO } from "./consultas";
import { COR_BRUXCON, corFraca } from "./config";
import { useNomeDeCanal } from "./canal";
import type { Projeto, Usuario } from "./types";

const CHAVE_SELECAO = "ava:projeto-selecionado";

/**
 * Projetos do grupo e qual está selecionado neste aparelho.
 *
 * A escolha fica no localStorage pelo mesmo motivo do evento: o vendedor
 * abre o app no salão e precisa cair direto onde estava. Trocar de projeto
 * é ação explícita, pelo menu.
 */
export function useProjetos(perfil: Usuario | null) {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [restaurado, setRestaurado] = useState(false);
  const canalNome = useNomeDeCanal("projetos");

  const buscar = useCallback(async () => {
    const { data, error } = await supabase
      .from("projetos")
      .select(SELECT_PROJETO)
      .order("ordem")
      .order("nome");
    if (!error) setProjetos((data ?? []) as unknown as Projeto[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!perfil) return;
    buscar();

    const canal = supabase
      .channel(canalNome)
      .on("postgres_changes", { event: "*", schema: "public", table: "projetos" }, () => buscar())
      .subscribe();

    return () => {
      canal.unsubscribe();
    };
  }, [perfil, buscar, canalNome]);

  useEffect(() => {
    if (typeof window !== "undefined") setSelecionadoId(localStorage.getItem(CHAVE_SELECAO));
    setRestaurado(true);
  }, []);

  const selecionar = useCallback((id: string | null) => {
    setSelecionadoId(id);
    if (id) localStorage.setItem(CHAVE_SELECAO, id);
    else localStorage.removeItem(CHAVE_SELECAO);
  }, []);

  // Só projetos ativos aparecem para escolha; um projeto desativado some da
  // lista mas quem já estava nele continua enxergando (o evento não some).
  const ativos = useMemo(() => projetos.filter((p) => p.ativo), [projetos]);

  const projeto = useMemo(
    () => projetos.find((p) => p.id === selecionadoId) ?? null,
    [projetos, selecionadoId]
  );

  // Com um projeto só cadastrado, não faz sentido pedir para escolher.
  useEffect(() => {
    if (!restaurado || carregando || projeto || ativos.length !== 1) return;
    selecionar(ativos[0].id);
  }, [restaurado, carregando, projeto, ativos, selecionar]);

  return {
    projetos: ativos,
    todos: projetos,
    projeto,
    carregando: carregando || !restaurado,
    selecionar,
    recarregar: buscar,
  };
}

/** Aplica a cor do projeto em `--brand`, que o logo, os chips e os botões usam. */
export function useCorDoProjeto(projeto: Projeto | null) {
  const cor = projeto?.cor ?? COR_BRUXCON;
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--brand", cor);
    // A versão fraca precisa acompanhar, senão o chip fica com o fundo de
    // uma cor e o texto de outra.
    raiz.style.setProperty("--brand-weak", corFraca(cor));
  }, [cor]);
}
