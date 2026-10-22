import { useRef } from "react";

/**
 * Nome de canal realtime ÚNICO por instância de componente.
 *
 * `supabase.channel(nome)` devolve o canal que já existe com aquele nome,
 * em vez de criar outro. Dois componentes montados ao mesmo tempo com o
 * mesmo nome (Ranking por baixo, formulário de evento por cima — os dois
 * usam useUsuarios) tentavam registrar ouvinte num canal já inscrito, e a
 * biblioteca lança "cannot add postgres_changes callbacks after subscribe()".
 * Era a tela branca ao abrir "Novo evento".
 *
 * Sufixo aleatório por instância: cada componente tem o próprio canal e o
 * desmonte de um não derruba o do outro.
 */
export function useNomeDeCanal(prefixo: string) {
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    ref.current = `${prefixo}:${Math.random().toString(36).slice(2, 10)}`;
  }
  return ref.current;
}
