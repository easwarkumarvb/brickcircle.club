-- BrickCircle catalogue valuation pass (2026-08-22)
-- Fills estimated_value for every catalogue set using a transparent collector-value heuristic.
-- This is an ESTIMATE, not an appraisal or live market quote.
-- Existing non-zero values are preserved; missing/zero values are populated.

update public.lego_sets
set estimated_value = round((
  greatest(coalesce(piece_count,0), 1)::numeric * 0.10
  * case
      when coalesce(retired,false) then
        least(1.60, 1.00 + greatest(0, 2026 - coalesce(year,2020)) * 0.045)
      else
        1.00 + greatest(0, 2026 - coalesce(year,2020) - 2) * 0.012
    end
  * case
      when lower(coalesce(theme,'')) like '%star wars%' then 1.25
      when lower(coalesce(theme,'')) like '%technic%' then 1.12
      when lower(coalesce(theme,'')) like '%ideas%' then 1.18
      when lower(coalesce(theme,'')) like '%icons%' then 1.10
      when lower(coalesce(theme,'')) like '%architecture%' then 1.08
      when lower(coalesce(theme,'')) like '%creator expert%' then 1.08
      when lower(coalesce(theme,'')) like '%modular%' then 1.12
      else 1.00
    end
)::numeric / 5) * 5
where coalesce(estimated_value,0) <= 0;

-- Minimum catalogue value so very small sets do not display $0.
update public.lego_sets
set estimated_value = 20
where coalesce(estimated_value,0) < 20;
