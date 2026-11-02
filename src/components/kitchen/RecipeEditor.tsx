import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { AllergenPicker } from "./ui-bits";

type Recipe = Tables<"recipes">;

export function RecipeEditor({
  open,
  onOpenChange,
  recipe,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipe?: Recipe | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: recipe?.title ?? "",
    category: recipe?.category ?? "",
    servings: recipe?.servings ?? "",
    ingredients: recipe?.ingredients ?? "",
    instructions: recipe?.instructions ?? "",
    notes: recipe?.notes ?? "",
    allergens: recipe?.allergens ?? [],
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let photo_path = recipe?.photo_path ?? null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("recipe-photos").upload(path, file, { contentType: file.type });
        if (error) throw error;
        if (photo_path) await supabase.storage.from("recipe-photos").remove([photo_path]);
        photo_path = path;
      }
      const payload = { ...form, photo_path, updated_at: new Date().toISOString() };
      let id = recipe?.id;
      if (id) {
        const { error } = await supabase.from("recipes").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("recipes")
          .insert({ ...payload, created_by: u.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      await qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Recipe saved");
      onOpenChange(false);
      onSaved?.(id!);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{recipe ? "Edit recipe" : "New recipe"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Name</Label>
            <Input id="title" value={form.title} onChange={set("title")} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input id="category" placeholder="Sauce, starter…" value={form.category} onChange={set("category")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="servings">Yield</Label>
              <Input id="servings" placeholder="4 L / 20 portions" value={form.servings} onChange={set("servings")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Photo</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-muted/50 p-4 text-sm hover:bg-muted">
              <Camera className="h-5 w-5 text-primary" />
              <span>{file ? file.name : recipe?.photo_path ? "Replace photo" : "Take or choose a photo"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ingredients">Ingredients (one per line)</Label>
            <Textarea id="ingredients" rows={6} value={form.ingredients} onChange={set("ingredients")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instructions">Method</Label>
            <Textarea id="instructions" rows={6} value={form.instructions} onChange={set("instructions")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={3} value={form.notes} onChange={set("notes")} />
          </div>
          <div className="space-y-1.5">
            <Label>Allergens</Label>
            <AllergenPicker value={form.allergens} onChange={(allergens) => setForm({ ...form, allergens })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save recipe"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
