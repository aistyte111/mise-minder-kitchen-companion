import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ALLERGENS, formatDay, guestAllergiesQuery, recipesQuery, roleQuery, toISODate } from "@/lib/kitchen";
import { AllergenBadges, AllergenPicker, EmptyState, PageHeader } from "@/components/kitchen/ui-bits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/allergies")({
  head: () => ({
    meta: [
      { title: "Allergies — Mise" },
      { name: "description", content: "Guest allergy notes and which dishes contain each allergen." },
      { property: "og:title", content: "Allergies — Mise" },
      { property: "og:description", content: "Guest allergy notes and which dishes contain each allergen." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(guestAllergiesQuery(toISODate(new Date()))),
      context.queryClient.ensureQueryData(recipesQuery),
    ]);
  },
  component: AllergiesPage,
});

function AllergiesPage() {
  const today = toISODate(new Date());
  const { data: guests } = useSuspenseQuery(guestAllergiesQuery(today));
  const { data: recipes } = useSuspenseQuery(recipesQuery);
  const { data: role } = useQuery(roleQuery);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();

  async function del(id: string) {
    const { error } = await supabase.from("guest_allergies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["guest-allergies"] });
  }

  const matching = selected ? recipes.filter((r) => r.allergens.includes(selected)) : [];

  return (
    <>
      <PageHeader
        title="Allergies"
        subtitle="Guests coming up and allergens in our dishes"
        action={
          role?.isAdmin && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Guest allergy
            </Button>
          )
        }
      />
      <h2 className="mb-3 text-2xl">Guests</h2>
      {guests.length === 0 ? (
        <EmptyState>No upcoming guest allergies.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {guests.map((g) => (
            <li key={g.id} className="rounded-2xl border-l-4 border-primary bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {g.service_date === today ? "Today" : formatDay(g.service_date)}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{g.guest}</p>
                </div>
                {role?.isAdmin && (
                  <button onClick={() => del(g.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <AllergenBadges items={g.allergens} className="mt-2" />
              {g.details && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{g.details}</p>}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-10 text-2xl">Which dishes contain…</h2>
      <div className="flex flex-wrap gap-2">
        {ALLERGENS.map((a) => (
          <button
            key={a}
            onClick={() => setSelected(selected === a ? null : a)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              selected === a ? "border-warning bg-warning font-semibold text-warning-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {a}
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-4 rounded-2xl bg-card p-4 shadow-card">
          {matching.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recipes are tagged with {selected}.</p>
          ) : (
            <ul className="divide-y">
              {matching.map((r) => (
                <li key={r.id}>
                  <Link to="/recipes/$id" params={{ id: r.id }} className="block py-2 hover:text-primary">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {open && <GuestDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function GuestDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ guest: "", service_date: toISODate(new Date()), allergens: [] as string[], details: "" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("guest_allergies").insert(f);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["guest-allergies"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Guest allergy</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="g">Guest / table / booking</Label>
            <Input id="g" value={f.guest} onChange={(e) => setF({ ...f, guest: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sd">Date</Label>
            <Input id="sd" type="date" value={f.service_date} onChange={(e) => setF({ ...f, service_date: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label>Allergens</Label>
            <AllergenPicker value={f.allergens} onChange={(allergens) => setF({ ...f, allergens })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dt">Details</Label>
            <Textarea id="dt" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
