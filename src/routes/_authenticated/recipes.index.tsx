import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recipesQuery, roleQuery } from "@/lib/kitchen";
import { AllergenBadges, EmptyState, PageHeader } from "@/components/kitchen/ui-bits";
import { RecipePhoto } from "@/components/kitchen/RecipePhoto";
import { RecipeEditor } from "@/components/kitchen/RecipeEditor";

export const Route = createFileRoute("/_authenticated/recipes/")({
  head: () => ({
    meta: [
      { title: "Recipes — Mise" },
      { name: "description", content: "The kitchen's recipe book with photos, method and allergens." },
      { property: "og:title", content: "Recipes — Mise" },
      { property: "og:description", content: "The kitchen's recipe book with photos, method and allergens." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(recipesQuery),
  component: RecipesPage,
});

function RecipesPage() {
  const { data: recipes } = useSuspenseQuery(recipesQuery);
  const { data: role } = useQuery(roleQuery);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return recipes;
    return recipes.filter((r) =>
      [r.title, r.category, r.ingredients].some((f) => f.toLowerCase().includes(s)),
    );
  }, [q, recipes]);

  return (
    <>
      <PageHeader
        title="Recipes"
        subtitle={`${recipes.length} in the book`}
        action={
          role?.isAdmin && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New recipe
            </Button>
          )
        }
      />
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="bg-card pl-9" placeholder="Search name, category or ingredient" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState>{recipes.length ? "No recipes match." : "No recipes yet."}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to="/recipes/$id"
              params={{ id: r.id }}
              className="group overflow-hidden rounded-2xl bg-card shadow-card transition-transform hover:-translate-y-0.5"
            >
              <RecipePhoto path={r.photo_path} alt={r.title} className="aspect-[4/3] w-full" />
              <div className="p-4">
                {r.category && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{r.category}</p>}
                <h2 className="mt-1 text-xl">{r.title}</h2>
                <AllergenBadges items={r.allergens} className="mt-3" />
              </div>
            </Link>
          ))}
        </div>
      )}
      {open && (
        <RecipeEditor open={open} onOpenChange={setOpen} onSaved={(id) => navigate({ to: "/recipes/$id", params: { id } })} />
      )}
    </>
  );
}
