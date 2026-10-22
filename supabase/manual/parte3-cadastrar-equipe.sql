-- PARTE 3 de 3 — cadastra a equipe da v1 (o antigo EMAIL_MAP).
-- Rode depois das partes 1 e 2. Faz o mesmo que scripts/criar-usuarios.mjs:
-- cria a conta de login (já confirmada, sem e-mail) e o perfil em `usuarios`.
--
-- No fim aparece uma tabela com as SENHAS TEMPORÁRIAS. Anote ou exporte na
-- hora: elas não ficam guardadas em lugar nenhum. Cada pessoa é obrigada a
-- trocar no primeiro acesso.
--
-- Pode rodar de novo sem medo: e-mail que já existe é pulado (senha intacta).
-- Para incluir alguém, acrescente uma linha na lista abaixo.

drop table if exists pg_temp.equipe, pg_temp.senhas;
create temp table equipe (email text, nome text, papel public.papel, sck text);
insert into equipe values
  ('everton@comercial10x.com.br',       'Everton',        'admin',  'Everton'),
  ('jezreel@comercial10x.com.br',       'Jezreel',        'admin',  'Jez'),
  ('admin@sibx.com.br',                 'Felipe',         'admin',  'Felipe'),
  ('dsgnelias@gmail.com',               'Elias',          'admin',  null),
  ('comercial1@comercial10x.com.br',    'Renato',         'admin',  'Renato'),
  ('willysc7@gmail.com',                'Willy',          'closer', 'Willy'),
  ('especialista1@comercial10x.com.br', 'Bruna',          'closer', 'Bruna'),
  ('especialista2@comercial10x.com.br', 'Gabriel Jesus',  'closer', 'GabrielJesus'),
  ('especialista5@comercial10x.com.br', 'Gabriel Aduati', 'closer', 'GabrielAduati'),
  ('especialista3@comercial10x.com.br', 'Mila',           'closer', 'Mila'),
  ('especialista4@comercial10x.com.br', 'Rodrigo',        'closer', 'Rodrigo'),
  ('a.caroline2396@gmail.com',          'Ani Caroline',   'closer', 'Ani'),
  ('especialista6@comercial10x.com.br', 'Ana Luiza',      'closer', 'Ana');

create temp table senhas (nome text, email text, papel public.papel, senha text);

do $$
declare
  p      record;
  uid    uuid;
  senha  text;
  letras text := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  nums   text := '23456789';
begin
  for p in
    select e.* from equipe e
    where not exists (select 1 from auth.users u where lower(u.email) = lower(e.email))
  loop
    uid := gen_random_uuid();
    -- Sem caracteres ambíguos (0/O, 1/l/I): vai ser ditada por telefone.
    senha := 'Bx-'
      || (select string_agg(substr(letras, 1 + floor(random() * length(letras))::int, 1), '') from generate_series(1, 3))
      || (select string_agg(substr(nums,   1 + floor(random() * length(nums))::int,   1), '') from generate_series(1, 4));

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      p.email, extensions.crypt(senha, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nome', p.nome), now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid, uid::text, 'email',
      jsonb_build_object('sub', uid::text, 'email', p.email, 'email_verified', true),
      now(), now(), now()
    );

    insert into public.usuarios (id, email, nome, papel, ativo, precisa_trocar_senha, sck, criado_por)
    values (uid, p.email, p.nome, p.papel, true, true, p.sck, 'migracao-v1');

    insert into senhas values (p.nome, p.email, p.papel, senha);
  end loop;
end $$;

-- Quem já existia não aparece aqui (a senha dele não foi mexida).
select * from senhas order by papel, nome;
