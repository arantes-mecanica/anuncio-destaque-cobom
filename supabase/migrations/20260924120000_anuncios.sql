-- Histórico curto de anúncios (48h a partir da data do fato), só para
-- facilitar atualização/retificação. Guarda apenas o texto final do anúncio —
-- nunca a conversa nem o texto bruto de PDFs/relatórios SISP.
--
-- Acesso só pela Edge Function gerar-anuncio (service role): RLS ligado e
-- nenhuma policy, de propósito, para a anon key não ler nada pela API REST.

create table public.anuncios (
  id           uuid primary key default gen_random_uuid(),
  texto        text not null,
  destaque_cbu boolean not null default false,
  data_fato    timestamptz,  -- extraída do campo DATA/HORA; null se não informada
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expira_em    timestamptz not null
);

-- expira_em = data do fato (ou criação, se não informada) + 48h. Via trigger
-- porque timestamptz + interval não é IMMUTABLE e não pode ser coluna gerada.
create function public.anuncios_set_expira_em() returns trigger
language plpgsql as $$
begin
  new.expira_em := coalesce(new.data_fato, new.created_at) + interval '48 hours';
  return new;
end;
$$;

create trigger anuncios_set_expira_em
  before insert or update on public.anuncios
  for each row execute function public.anuncios_set_expira_em();

create index anuncios_expira_em_idx on public.anuncios (expira_em);

alter table public.anuncios enable row level security;
