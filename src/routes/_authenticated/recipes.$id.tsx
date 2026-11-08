import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { recipeQuery, roleQuery } from "@/lib/kitchen";
import { AllergenBadges, EmptyState } from "@/components/kitchen/ui-bits";
import { RecipePhoto } from "@/components/kitchen/RecipePhoto";
import { RecipeEditor } from "@/components/kitchen/RecipeEditor";

export const Route = createFileRoute("/_authenticated/recipes/$id")({
  head: () => ({
    meta: [
      { title: "Recipe — Mise" },
      { name: "description", content: "Ingredients, method, notes and allergens for this dish." },
      { property: "og:title", content: "Recipe — Mise" },
      { property: "og:description", content: "Ingredients, method, notes and allergens for this dish." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(recipeQuery(params.id)),
  component: RecipeDetail,
});

function RecipeDetail() {
  const { id } = Route.useParams();
  const { data: recipe } = useSuspenseQuery(recipeQuery(id));
  const { data: role } = useQuery(roleQuery);
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (!recipe) return <EmptyState>This recipe no longer exists.</EmptyState>;

  async function remove() {
    if (!recipe || !confirm(`Delete "${recipe.title}"?`)) return;
    const { error } = await supabase.from("recipes").delete().eq("id", recipe.id);
    if (error) { toast.error(error.message); return; }
    if (recipe.photo_path) await supabase.storage.from("recipe-photos").remove([recipe.photo_path]);
    await qc.invalidateQueries({ queryKey: ["recipes"] });
    navigate({ to: "/recipes" });
  }

  const ingredients = recipe.ingredients.split("\n").filter((l) => l.trim());

  return (
    <article>
      <Link to="/recipes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All recipes
      </Link>
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <RecipePhoto path={recipe.photo_path} alt={recipe.title} className="aspect-[16/9] max-h-[420px] w-full" />
        <div className="p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {recipe.category && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{recipe.category}</p>}
              <h1 className="mt-1 text-4xl md:text-5xl">{recipe.title}</h1>
              {recipe.servings && <p className="mt-2 text-muted-foreground">Yield: {recipe.servings}</p>}
            </div>
            {role?.isAdmin && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={remove} aria-label="Delete recipe">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>
          {recipe.allergens.length > 0 && (
            <div className="mt-5 rounded-xl bg-warning/30 p-4">
              <p className="mb-2 text-sm font-semibold">Contains allergens</p>
              <AllergenBadges items={recipe.allergens} />
            </div>
          )}
          <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.6fr]">
            <section>
              <h2 className="text-2xl">Ingredients</h2>
              <ul className="mt-3 space-y-2">
                {ingredients.length ? (
                  ingredients.map((l, i) => (
                    <li key={i} className="border-b border-dashed pb-2 text-sm">
                      {l}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">None listed</li>
                )}
              </ul>
            </section>
            <section>
              <h2 className="text-2xl">Method</h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed">{recipe.instructions || "—"}</p>
              {recipe.notes && (
                <>
                  <h2 className="mt-8 text-2xl">Notes</h2>
                  <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm leading-relaxed">{recipe.notes}</p>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
      {editing && <RecipeEditor open={editing} onOpenChange={setEditing} recipe={recipe} />}
    </article>
  );
}
