-- =========================================================================
-- Melhorias de operacao trazidas do app Comercial Cris Miura - 0009
--
-- Reune, numa migracao so, o que la foram as migracoes 0008-0013 e 0015:
--
--   1. eventos.link_analise    - URL de um painel externo (Lead Score,
--                                check-in). Vira atalho no menu.
--   2. eventos.link_contratos  - URL base do sistema de assinatura de
--                                contratos. Preenchido, o botao "Contrato"
--                                da venda abre la o formulario ja com os
--                                dados da venda.
--   3. CEP em vendas e leads   - o contrato busca o endereco por ele.
--   4. inscritos               - base de inscritos com Lead Score, importada
--                                do painel de conversao. Alimenta as abas
--                                Analise e Participantes.
--   5. abordagens              - quem falou com quem no salao, e o que foi
--                                conversado. Historico por participante e
--                                contagem por vendedor.
--   6. admin corrige o vendedor da venda (lancada no login errado).
--
-- Tudo e aditivo: nenhuma coluna ou politica existente muda de sentido.
-- =========================================================================

-- -- 1 e 2. Links externos do evento -------------------------------------

alter table public.eventos
  add column if not exists link_analise   text,
  add column if not exists link_contratos text;

comment on column public.eventos.link_analise is
  'URL do painel de analise de dados do evento (dashboard externo, fora deste app). Opcional.';
comment on column public.eventos.link_contratos is
  'URL base do sistema de assinatura de contratos (externo). Opcional. Sem /novo no final.';

-- -- 3. CEP ---------------------------------------------------------------

alter table public.vendas add column if not exists cep text;
alter table public.leads  add column if not exists cep text;

comment on column public.vendas.cep is 'CEP do cliente. Vai para o contrato, que preenche o endereco.';
comment on column public.leads.cep  is 'CEP do participante (opcional, pode vir da importacao).';

-- -- 4. Inscritos com Lead Score ------------------------------------------
-- Tabela propria, nao colunas em `leads`: `leads` e a lista do cracha (quem
-- o closer aborda no salao). Inscrito e quem preencheu a inscricao, tenha
-- ou nao vindo. A chave e o e-mail, porque e o que liga inscrito <-> venda.
-- `extras` guarda o resto das colunas do painel sem virar 55 colunas aqui.

create table if not exists public.inscritos (
  evento_id        uuid not null references public.eventos(id) on delete cascade,
  email            text not null,                  -- minusculo, sem espacos
  nome             text not null,
  whatsapp         text,

  -- Lead Score (perfil 70% + comprometimento 30%). 'X' = nao respondeu.
  classe           text not null default 'X',
  nota             numeric,
  perfil           numeric,
  comprometimento  numeric,
  tipo             text,
  ja_aluno         boolean,

  -- Perfil declarado
  faturamento      text,
  idade            text,
  tempo_formado    text,
  area_atuacao     text,
  categoria_ticket text,
  tem_produto      boolean not null default false,
  produtos         text,

  -- Presenca
  checkin_feito    boolean not null default false,
  d1               boolean not null default false,
  d2               boolean not null default false,
  d3               boolean not null default false,

  -- Funil de contato
  ligou            boolean not null default false,
  resultado_ligacao text,
  contato_confirmou text,

  extras           jsonb not null default '{}'::jsonb,
  importado_em     timestamptz not null default now(),

  primary key (evento_id, email)
);

create index if not exists inscritos_evento_classe on public.inscritos (evento_id, classe);

alter table public.inscritos enable row level security;

-- Toda a equipe le: o closer consulta UMA pessoa antes de abordar (classe,
-- o que respondeu, se confirmou) - mesmo acesso que ja tem em `leads`.
-- Os agregados da aba Analise ficam limitados a admin/gestor na tela.
drop policy if exists inscritos_leitura on public.inscritos;
create policy inscritos_leitura on public.inscritos
  for select to authenticated using (public.eh_equipe());

-- Escrita: so pela API com a service role (ignora RLS). Nenhuma policy de
-- insert/update/delete de proposito.

comment on table public.inscritos is
  'Inscritos do evento com Lead Score, importados do painel de conversao. Chave: e-mail.';

-- -- 5. Abordagens --------------------------------------------------------
-- Uma linha por conversa. Sem FK para inscritos de proposito: a base de
-- inscritos e substituida inteira a cada reimportacao, e o historico de
-- conversas precisa sobreviver a isso.

create table if not exists public.abordagens (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references public.eventos(id) on delete cascade,
  email        text not null,
  usuario_id   uuid references public.usuarios(id) on delete set null,
  por_nome     text not null,
  observacao   text not null,
  em           timestamptz not null default now()
);

create index if not exists abordagens_evento_email   on public.abordagens (evento_id, email, em desc);
create index if not exists abordagens_evento_usuario on public.abordagens (evento_id, usuario_id);

alter table public.abordagens enable row level security;

drop policy if exists abordagens_leitura  on public.abordagens;
drop policy if exists abordagens_insercao on public.abordagens;
drop policy if exists abordagens_edicao   on public.abordagens;
drop policy if exists abordagens_exclusao on public.abordagens;

-- Toda a equipe le: o valor esta justamente em ver o que o colega ja falou.
create policy abordagens_leitura on public.abordagens
  for select to authenticated using (public.eh_equipe());

-- Cada um registra em seu proprio nome (senao dava para inflar a contagem
-- de abordagens de outra pessoa).
create policy abordagens_insercao on public.abordagens
  for insert to authenticated
  with check (public.eh_equipe() and usuario_id = auth.uid());

create policy abordagens_edicao on public.abordagens
  for update to authenticated
  using (public.eh_admin() or usuario_id = auth.uid())
  with check (public.eh_admin() or usuario_id = auth.uid());

create policy abordagens_exclusao on public.abordagens
  for delete to authenticated
  using (public.eh_admin() or usuario_id = auth.uid());

comment on table public.abordagens is
  'Conversas registradas com participantes do evento. Uma linha por abordagem; o historico sobrevive a reimportacao do painel.';

-- Registrar uma abordagem precisa aparecer na ficha do colega na hora.
alter publication supabase_realtime add table public.abordagens;

-- -- 6. Admin corrige o vendedor da venda ---------------------------------
-- A trava original (0001) impedia QUALQUER troca de dono. Continua valendo
-- para gestor, closer e promotor. O admin passa a poder corrigir: venda
-- lancada no login errado (celular emprestado no salao) hoje so se resolve
-- excluindo e refazendo, o que perde o historico e a auditoria.
-- Mover venda para outro evento continua proibido para todos.

create or replace function public.impedir_troca_de_dono()
returns trigger language plpgsql as $$
begin
  if new.usuario_id is distinct from old.usuario_id and not public.eh_admin() then
    raise exception 'Nao e permitido transferir a venda para outro vendedor.';
  end if;
  if new.evento_id is distinct from old.evento_id then
    raise exception 'Nao e permitido mover a venda para outro evento.';
  end if;
  return new;
end $$;

comment on function public.impedir_troca_de_dono is
  'Trava a troca de evento para todos e a troca de vendedor para todos, menos admin (correcao de venda lancada no login errado).';
