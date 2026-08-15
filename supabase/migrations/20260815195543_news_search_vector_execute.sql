-- Generated search_vector on market_news_items calls text_array_join during
-- INSERT/UPDATE. The original migration revoked PUBLIC execute, so service-role
-- upserts failed with "permission denied for function text_array_join".
-- Keep PUBLIC revoked; allow the writer role only.

grant execute on function public.text_array_join(text[]) to service_role;
grant execute on function public.text_array_join(text[]) to postgres;
