import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ALLERGENS = [
  "Gluten",
  "Crustaceans",
  "Eggs",
  "Fish",
  "Peanuts",
  "Soy",
  "Dairy",
  "Tree nuts",
  "Celery",
  "Mustard",
  "Sesame",
  "Sulphites",
  "Lupin",
  "Molluscs",
  "Onion",
  "Garlic",
  "Gelatine",
] as const;

export const SCHEDULE_KINDS = [
  { value: "shift", label: "Shift" },
  { value: "prep", label: "Prep task" },
  { value: "event", label: "Event" },
] as const;

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function formatDay(iso: string) {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatTime(t: string | null) {
  return t ? t.slice(0, 5) : "";
}

export const roleQuery = queryOptions({
  queryKey: ["my-role"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return { isAdmin: false, userId: null as string | null };
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    return { isAdmin: !!data?.some((r) => r.role === "admin"), userId: u.user.id };
  },
});

export const recipesQuery = queryOptions({
  queryKey: ["recipes"],
  queryFn: async () => {
    const { data, error } = await supabase.from("recipes").select("*").order("title");
    if (error) throw error;
    return data;
  },
});

export const recipeQuery = (id: string) =>
  queryOptions({
    queryKey: ["recipes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const weekRange = () => {
  const today = new Date();
  return { from: toISODate(today), to: toISODate(addDays(today, 7)) };
};

export const scheduleQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["schedule", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_items")
        .select("*")
        .gte("item_date", from)
        .lte("item_date", to)
        .order("item_date")
        .order("start_time", { nullsFirst: true });
      if (error) throw error;
      return data;
    },
  });

export const notesQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["notes", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .gte("note_date", from)
        .lte("note_date", to)
        .order("note_date")
        .order("important", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const guestAllergiesQuery = (from: string) =>
  queryOptions({
    queryKey: ["guest-allergies", from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guest_allergies")
        .select("*")
        .gte("service_date", from)
        .order("service_date");
      if (error) throw error;
      return data;
    },
  });

export async function signedPhotoUrl(path: string) {
  const { data } = await supabase.storage.from("recipe-photos").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export const misaProjectsQuery = queryOptions({
  queryKey: ["misa", "projects"],
  queryFn: async () => {
    const { data, error } = await supabase.from("misa_projects").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
export const misaTasksQuery = (projectId: string) => queryOptions({
  queryKey: ["misa", "tasks", projectId],
  queryFn: async () => {
    const { data, error } = await supabase.from("misa_tasks").select("*").eq("project_id", projectId).order("created_at");
    if (error) throw error;
    return data;
  },
  refetchInterval: 10000,
});
export const misaSourcesQuery = (projectId: string) => queryOptions({
  queryKey: ["misa", "sources", projectId],
  queryFn: async () => {
    const { data, error } = await supabase.from("misa_sources").select("*").eq("project_id", projectId).order("created_at");
    if (error) throw error;
    return data;
  },
});
