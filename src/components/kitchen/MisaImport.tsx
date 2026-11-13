import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { readMisaFile } from "@/lib/misa-import.functions";
import { MISA_ACCEPT, prepareMisaFile } from "@/lib/misa-file";
import { misaTaskSchema, type PrepImport } from "@/lib/misa-workflow";
import { misaBoardProjectId } from "@/lib/kitchen";
import { AllergenPicker } from "./ui-bits";

type Row = PrepImport["tasks"][number];
const empty = (): Row => ({ title: "", dish: "", allergens: [], details: "" });

/** Uploads files to the board folder and records them as attachments. Returns uploaded paths. */
export async function attachMisaFiles(files: File[]) {
  const projectId = await misaBoardProjectId();
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const path = `${projectId}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "bin"}`;
      const { error } = await supabase.storage.from("misa-files").upload(path, file, file.type ? { contentType: file.type } : {});
      if (error) throw error;
      uploaded.push(path);
    }
    const { error } = await supabase.from("misa_sources").insert(files.map((file, i) => ({ project_id: projectId, filename: file.name, storage_path: uploaded[i] ?? "" })));
    if (error) throw error;
    return { projectId, uploaded };
  } catch (e) {
    if (uploaded.length) await supabase.storage.from("misa-files").remove(uploaded);
    throw e;
  }
}

export function MisaImport({ onClose }: { onClose: () => void }) {
  const read = useServerFn(readMisaFile);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  async function load(selected: File[]) {
    setBusy(true); setError("");
    const found: Row[] = []; const sources: File[] = [];
    try {
      for (const original of selected) {
        const { file, ...input } = await prepareMisaFile(original);
        const result = await read({ data: { filename: file.name, ...input } });
        found.push(...result.tasks); sources.push(file);
      }
      setTasks(found); setFiles(sources); setReview(true);
      if (!found.length) setError("No prep tasks found. You can add tasks manually.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read the files."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    let uploaded: string[] = [];
    try {
      const att = await attachMisaFiles(files);
      uploaded = att.uploaded;
      const rows = tasks.map((t) => ({ ...misaTaskSchema.parse({ title: t.title, details: t.details, status: "todo" }), dish: t.dish.trim(), allergens: t.allergens, project_id: att.projectId }));
      const { error } = await supabase.from("misa_tasks").insert(rows);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["misa"] });
      toast.success(`Added ${rows.length} prep tasks`); onClose();
    } catch (e) {
      if (uploaded.length) { await supabase.from("misa_sources").delete().in("storage_path", uploaded); await supabase.storage.from("misa-files").remove(uploaded); }
      setError(e instanceof Error ? e.message : "Could not save the prep list.");
    } finally { setBusy(false); }
  }
  function update(index: number, patch: Partial<Row>) {
    setTasks((cur) => cur.map((t, i) => i === index ? { ...t, ...patch } : t));
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Import prep list</DialogTitle></DialogHeader>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {!review ? <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center">
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileUp className="h-8 w-8 text-primary" />}
        <span>{busy ? "Reading prep lists…" : "Choose photos or documents"}</span>
        <span className="text-xs text-muted-foreground">Photos (incl. iPhone), PDF, Word, Excel or CSV</span>
        <input aria-label="Prep files" type="file" multiple accept={MISA_ACCEPT} disabled={busy} className="sr-only" onChange={(e) => { const s = Array.from(e.target.files ?? []); if (s.length) void load(s); e.target.value = ""; }} />
      </label> : <>
        <p className="text-sm text-muted-foreground">{tasks.length} tasks · {files.length} files kept as attachments · start in To do</p>
        <div className="space-y-3">{tasks.map((t, i) => <div key={i} className="rounded-lg border p-3">
          <div className="mb-2 flex gap-2"><Input aria-label={`Dish ${i + 1}`} placeholder="Dish" value={t.dish} onChange={(e) => update(i, { dish: e.target.value })} /><Button variant="ghost" size="icon" aria-label={`Remove task ${i + 1}`} onClick={() => setTasks(tasks.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
          <Input aria-label={`Task ${i + 1}`} placeholder="Task name" value={t.title} maxLength={300} onChange={(e) => update(i, { title: e.target.value })} />
          <div className="mt-2"><AllergenPicker value={t.allergens} onChange={(allergens) => update(i, { allergens })} /></div>
          <Textarea aria-label={`Notes ${i + 1}`} placeholder="Notes" className="mt-2" value={t.details} onChange={(e) => update(i, { details: e.target.value })} />
        </div>)}</div>
        <Button variant="outline" size="sm" onClick={() => setTasks([...tasks, empty()])}><Plus className="h-4 w-4" />Add row</Button>
        <div className="sticky bottom-0 flex flex-wrap gap-2 bg-background pt-3"><Button variant="outline" disabled={busy} onClick={() => { setReview(false); setTasks([]); setError(""); }}>Choose other files</Button><Button disabled={busy || !tasks.length || tasks.some((t) => !t.title.trim())} onClick={() => void save()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save {tasks.length} tasks</Button></div>
      </>}
    </DialogContent>
  </Dialog>;
}
