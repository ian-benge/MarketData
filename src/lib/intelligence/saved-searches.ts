import { canCreateServerClient, createClient } from "@/lib/supabase/server";

export type SavedNewsSearch = {
  id: string;
  name: string;
  query: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: {
  id: string;
  name: string;
  query: string;
  filters: unknown;
  created_at: string;
  updated_at: string;
}): SavedNewsSearch {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    filters: (row.filters ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSavedNewsSearches(
  userId: string,
  firmId: string,
): Promise<SavedNewsSearch[]> {
  if (!canCreateServerClient()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("news_saved_searches")
      .select("id, name, query, filters, created_at, updated_at")
      .eq("user_id", userId)
      .eq("firm_id", firmId)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) {
      console.error("[news] listSavedNewsSearches", error.message);
      return [];
    }
    return (data ?? []).map((row) => mapRow(row as Parameters<typeof mapRow>[0]));
  } catch (error) {
    console.error("[news] listSavedNewsSearches", error);
    return [];
  }
}

export async function saveNewsSearch(input: {
  userId: string;
  firmId: string;
  name: string;
  query: string;
  filters?: Record<string, unknown>;
}): Promise<SavedNewsSearch | null> {
  if (!canCreateServerClient()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("news_saved_searches")
      .upsert(
        {
          user_id: input.userId,
          firm_id: input.firmId,
          name: input.name.trim().slice(0, 80),
          query: input.query.trim().slice(0, 400),
          filters: input.filters ?? {},
        },
        { onConflict: "user_id,name" },
      )
      .select("id, name, query, filters, created_at, updated_at")
      .single();
    if (error || !data) {
      if (error) console.error("[news] saveNewsSearch", error.message);
      return null;
    }
    return mapRow(data as Parameters<typeof mapRow>[0]);
  } catch (error) {
    console.error("[news] saveNewsSearch", error);
    return null;
  }
}

export async function deleteSavedNewsSearch(input: {
  id: string;
  userId: string;
  firmId: string;
}): Promise<boolean> {
  if (!canCreateServerClient()) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("news_saved_searches")
      .delete()
      .eq("id", input.id)
      .eq("user_id", input.userId)
      .eq("firm_id", input.firmId);
    if (error) {
      console.error("[news] deleteSavedNewsSearch", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[news] deleteSavedNewsSearch", error);
    return false;
  }
}
