create or replace function public.bc_search_lego_sets(
  p_query text,
  p_theme text default null,
  p_year integer default null,
  p_limit integer default 60
)
returns table(
  set_number text,
  name text,
  theme text,
  year integer,
  piece_count integer,
  estimated_value numeric,
  image_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select lower(trim(coalesce(p_query,''))) as q,
           nullif(trim(coalesce(p_theme,'')),'') as theme_filter,
           p_year as year_filter,
           least(greatest(coalesce(p_limit,60),1),100) as lim
  ), ranked as (
    select
      l.set_number,
      l.name,
      l.theme,
      l.year,
      l.piece_count,
      l.estimated_value,
      l.image_url,
      case
        when lower(l.set_number)=p.q then 0
        when lower(l.name)=p.q then 1
        when lower(l.name) like p.q || '%' then 2
        when lower(l.name) like '%' || p.q || '%' then 3
        when lower(coalesce(l.theme,'')) like '%' || p.q || '%' then 4
        else 5
      end as rank_group
    from public.lego_sets l
    cross join params p
    where p.q <> ''
      and coalesce(l.catalog_active,true)
      and (p.theme_filter is null or lower(l.theme)=lower(p.theme_filter))
      and (p.year_filter is null or l.year=p.year_filter)
      and not (
        position('-' in l.set_number)=0
        and exists (
          select 1
          from public.lego_sets lx
          where lx.set_number=l.set_number || '-1'
            and not exists (
              select 1
              from regexp_split_to_table(p.q, '\s+') duplicate_token
              where concat_ws(' ',lower(lx.set_number),lower(coalesce(lx.name,'')),lower(coalesce(lx.theme,''))) not like '%' || duplicate_token || '%'
            )
        )
      )
      and not exists (
        select 1
        from regexp_split_to_table(p.q, '\s+') token
        where concat_ws(' ',lower(l.set_number),lower(coalesce(l.name,'')),lower(coalesce(l.theme,''))) not like '%' || token || '%'
      )
  )
  select r.set_number,r.name,r.theme,r.year,r.piece_count,r.estimated_value,r.image_url
  from ranked r
  cross join params p
  order by r.rank_group, r.year desc nulls last, r.name asc, r.set_number asc
  limit (select lim from params);
$$;

revoke execute on function public.bc_search_lego_sets(text,text,integer,integer) from public;
grant execute on function public.bc_search_lego_sets(text,text,integer,integer) to anon, authenticated;
