-- OpenAI is no longer a live LLM source. Desk intel, news overlays, and
-- reports use Anthropic, Gemini, or Vercel AI Gateway instead.
delete from public.provider_configs
where provider_key = 'openai';
