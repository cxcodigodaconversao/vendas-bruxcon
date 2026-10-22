-- =========================================================================
-- Catalogo de links automatico, POR PROJETO - 0010
--
-- Ideia trazida do app Comercial Cris Miura (migracao 0014 de la): o link
-- de pagamento se propaga sozinho, sem ninguem recadastrar 80 ofertas a
-- cada evento ou a cada vendedor novo.
--
-- A diferenca essencial aqui: a fonte NAO e "o evento com mais ofertas"
-- (isso misturaria produtos diferentes). A fonte e `projeto_ofertas` do
-- projeto DO EVENTO. Um evento do DTC Master so recebe ofertas do DTC Master.
--
--   * evento novo   -> recebe o catalogo do projeto dele, para "Casa" e para
--                      todos os vendedores ativos;
--   * usuario novo  -> recebe o catalogo de todos os eventos que ja existem,
--                      cada evento com o catalogo do proprio projeto;
--   * oferta nova   -> entra em todos os eventos daquele projeto.
--
-- Token de cada vendedor: `usuarios.sck`; vazio, usa o primeiro nome sem
-- acento (mesma regra do app da Cris, com o acento tirado). "Casa" fica SEM sck - link sem dono nao pode
-- carregar o rastreio de quem por acaso estava na URL.
--
-- Tudo `on conflict do nothing`: link que ja existe nunca e sobrescrito.
-- Quem quer regerar usa a tela (Links -> Gerir).
-- =========================================================================

-- -- 0. Token padrao de quem nao tem sck: primeiro nome, sem acento --------
-- O sck vai dentro da URL e e conferido a olho na Hotmart: acento vira
-- escape ilegivel la. Mesma regra de validarSck em lib/links.ts.

create or replace function public.sck_padrao(p_nome text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(split_part(trim(p_nome), ' ', 1),
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^A-Za-z0-9._-]', '', 'g')
$$;

-- -- 1. Destinatarios: Casa + quem pode vender ----------------------------

create or replace function public.destinos_de_links()
returns table (nome text, sck text)
language sql stable security definer set search_path = public as $$
  select 'Casa'::text, null::text
  union all
  select u.nome, coalesce(nullif(trim(u.sck), ''), public.sck_padrao(u.nome))
    from public.usuarios u
   where u.ativo and u.papel in ('admin', 'gestor', 'closer')
$$;

-- -- 2. Montar a URL com o token (mesma logica de trocarSck em lib/links.ts)

create or replace function public.url_com_sck(p_url text, p_sck text)
returns text language sql immutable as $$
  select case
    when p_sck is null or p_sck = '' then p_url
    else p_url || case when p_url like '%?%' then '&' else '?' end || 'sck=' || p_sck
  end
$$;

-- -- 3. Semear um evento a partir do catalogo do projeto dele -------------

create or replace function public.semear_links_do_evento(p_evento_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select e.id, d.nome, d.sck, 'new', o.oferta, o.valor, o.condicao, public.url_com_sck(o.url, d.sck)
    from public.eventos e
    join public.projeto_ofertas o on o.projeto_id = e.projeto_id and o.ativo
    cross join public.destinos_de_links() d
   where e.id = p_evento_id
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.semear_links_do_evento is
  'Cria os links de um evento a partir do catalogo do PROJETO dele, para Casa e todos os vendedores ativos. Nao toca em link que ja existe.';

-- -- 4. Semear um vendedor em todos os eventos ----------------------------

create or replace function public.semear_links_do_vendedor(p_usuario_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_sck  text;
  n integer;
begin
  select u.nome, coalesce(nullif(trim(u.sck), ''), public.sck_padrao(u.nome))
    into v_nome, v_sck
    from public.usuarios u
   where u.id = p_usuario_id and u.ativo and u.papel in ('admin', 'gestor', 'closer');

  if v_nome is null then return 0; end if;

  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select e.id, v_nome, v_sck, 'new', o.oferta, o.valor, o.condicao, public.url_com_sck(o.url, v_sck)
    from public.eventos e
    join public.projeto_ofertas o on o.projeto_id = e.projeto_id and o.ativo
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- -- 5. Semear uma oferta nova em todos os eventos do projeto -------------

create or replace function public.semear_links_da_oferta(p_oferta_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select e.id, d.nome, d.sck, 'new', o.oferta, o.valor, o.condicao, public.url_com_sck(o.url, d.sck)
    from public.projeto_ofertas o
    join public.eventos e on e.projeto_id = o.projeto_id
    cross join public.destinos_de_links() d
   where o.id = p_oferta_id and o.ativo
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- -- 6. Gatilhos ----------------------------------------------------------

create or replace function public.ao_criar_evento_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_do_evento(new.id);
  return new;
end $$;

drop trigger if exists eventos_semear_links on public.eventos;
create trigger eventos_semear_links
  after insert on public.eventos
  for each row execute function public.ao_criar_evento_semear_links();

create or replace function public.ao_criar_usuario_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_do_vendedor(new.id);
  return new;
end $$;

drop trigger if exists usuarios_semear_links on public.usuarios;
create trigger usuarios_semear_links
  after insert on public.usuarios
  for each row execute function public.ao_criar_usuario_semear_links();

create or replace function public.ao_criar_oferta_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_da_oferta(new.id);
  return new;
end $$;

drop trigger if exists projeto_ofertas_semear_links on public.projeto_ofertas;
create trigger projeto_ofertas_semear_links
  after insert on public.projeto_ofertas
  for each row execute function public.ao_criar_oferta_semear_links();

-- -- 7. Preencher o que ja existe -----------------------------------------
-- Roda uma vez, agora: todo evento recebe o que faltar do catalogo do
-- proprio projeto. Link existente nao e tocado.

do $$
declare
  ev record;
  total integer := 0;
  n integer;
begin
  for ev in select e.id, e.nome, p.sigla from public.eventos e join public.projetos p on p.id = e.projeto_id loop
    n := public.semear_links_do_evento(ev.id);
    total := total + n;
    raise notice '[%] "%": % links criados.', ev.sigla, ev.nome, n;
  end loop;
  raise notice 'Total: % links.', total;
end $$;

-- Conferencia: links por projeto, evento e vendedor
select p.sigla as projeto, e.nome as evento, l.vendedor_nome, count(*) as links
  from public.links l
  join public.eventos e on e.id = l.evento_id
  join public.projetos p on p.id = e.projeto_id
 group by p.sigla, e.nome, l.vendedor_nome
 order by p.sigla, e.nome, l.vendedor_nome;
