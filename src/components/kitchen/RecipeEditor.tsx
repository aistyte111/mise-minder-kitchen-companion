import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileText, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { readRecipeFile } from "@/lib/recipe-import.functions";
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
  const [reading, setReading] = useState(false);
  const readFn = useServerFn(readRecipeFile);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  // iPhone photos arrive as HEIC; browsers and the AI reader need JPEG instead.
  async function toJpeg(f: File): Promise<File> {
    const name = f.name.toLowerCase();
    const isHeic = ["image/heic", "image/heif", "image/heic-sequence"].includes(f.type) || /\.hei[cf]$/.test(name);
    if (!isHeic) return f;
    const heic2any = (await import("heic2any")).default;
    const blob = (await heic2any({ blob: f, toType: "image/jpeg", quality: 0.9 })) as Blob;
    const jpgName = name.replace(/\.hei[cf]$/, "") + ".jpg";
    return new File([blob], jpgName, { type: "image/jpeg" });
  }

  async function importFrom(fileIn: File) {
    setReading(true);
    try {
      const f = await toJpeg(fileIn);
      const name = f.name.toLowerCase();
      let input: { fileBase64: string | null; mediaType: string | null; text: string | null };
      if (f.type.startsWith("image/") || name.endsWith(".pdf")) {
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        input = { fileBase64: btoa(bin), mediaType: f.type || "application/pdf", text: null };
      } else if (/\.(xlsx|xls|csv|ods)$/.test(name)) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await f.arrayBuffer());
        const text = wb.SheetNames.map((s) => `# Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s]!)}`).join("\n\n");
        input = { fileBase64: null, mediaType: null, text };
      } else if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        input = { fileBase64: null, mediaType: null, text: value };
      } else {
        throw new Error("Please choose a photo, PDF, Excel or Word (.docx) file.");
      }
      const r = await readFn({ data: { filename: f.name, ...input } });
      setForm((cur) => ({
        title: r.title || cur.title,
        category: r.category || cur.category,
        servings: r.servings || cur.servings,
        ingredients: r.ingredients || cur.ingredients,
        instructions: r.instructions || cur.instructions,
        notes: r.notes || cur.notes,
        allergens: r.allergens.length ? r.allergens : cur.allergens,
      }));
      if (f.type.startsWith("image/") && !file && !recipe?.photo_path) setFile(f);
      toast.success("Recipe read — check it before saving");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read the file.");
    } finally {
      setReading(false);
    }
  }


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
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm hover:bg-primary/10">
            {reading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
            <span>
              <span className="font-medium">{reading ? "Reading recipe… this can take a minute" : "Fill in from a photo or file"}</span>
              <span className="block text-muted-foreground">Photo of a recipe, PDF, Word or Excel. You can check it before saving.</span>
            </span>
            <input
              type="file"
              className="sr-only"
              disabled={reading}
              accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.ods"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFrom(f); e.target.value = ""; }}
            />
          </label>
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
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void toJpeg(f).then(setFile); e.target.value = ""; }}
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
