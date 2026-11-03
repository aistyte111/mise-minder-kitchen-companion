import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { readScheduleFile, type ImportedItem } from "@/lib/schedule-import.functions";
import { toISODate } from "@/lib/kitchen";

const TYPES = [
  { value: "shift", label: "Shift" },
  { value: "prep", label: "Prep" },
  { value: "event", label: "Event" },
  { value: "note", label: "Note" },
] as const;

async function fileToInput(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { pdfBase64: btoa(bin), text: null };
  }
  if (/\.(xlsx|xls|csv|ods)$/.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const text = wb.SheetNames.map((s) => `# Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s]!, { dateNF: "yyyy-mm-dd" })}`).join("\n\n");
    return { pdfBase64: null, text };
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return { pdfBase64: null, text: value };
  }
  throw new Error("Please choose a PDF, Excel (.xlsx/.xls/.csv) or Word (.docx) file.");
}

export function ScheduleImportDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const read = useServerFn(readScheduleFile);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ImportedItem[] | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const input = await fileToInput(file);
      const res = await read({ data: { filename: file.name, today: toISODate(new Date()), ...input } });
      if (!res.items.length) toast.error("Nothing found in that file.");
      setItems(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the file.");
    } finally {
      setBusy(false);
    }
  }

  const update = (i: number, patch: Partial<ImportedItem>) =>
    setItems((xs) => xs && xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function saveAll() {
    if (!items?.length) return;
    setBusy(true);
    const valid = items.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && x.title.trim());
    const notes = valid.filter((x) => x.type === "note").map((x) => ({
      note_date: x.date,
      body: x.details ? `${x.title}\n${x.details}` : x.title,
      important: x.important,
    }));
    const sched = valid.filter((x) => x.type !== "note").map((x) => ({
      kind: x.type,
      item_date: x.date,
      title: x.title,
      start_time: x.start_time || null,
      end_time: x.end_time || null,
      details: x.details,
    }));
    const [a, b] = await Promise.all([
      sched.length ? supabase.from("schedule_items").insert(sched) : Promise.resolve({ error: null }),
      notes.length ? supabase.from("notes").insert(notes) : Promise.resolve({ error: null }),
    ]);
    setBusy(false);
    const err = a.error ?? b.error;
    if (err) { toast.error(err.message); return; }
    qc.invalidateQueries({ queryKey: ["schedule"] });
    qc.invalidateQueries({ queryKey: ["notes"] });
    toast.success(`Added ${valid.length} items to the schedule`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Upload schedule file</DialogTitle>
        </DialogHeader>
        {!items ? (
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center">
            {busy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileUp className="h-8 w-8 text-primary" />}
            <span className="font-medium">{busy ? "Reading your file… this can take a minute" : "Choose a PDF, Excel or Word file"}</span>
            <span className="text-sm text-muted-foreground">AI reads it and you check everything before saving.</span>
            <input
              type="file"
              className="sr-only"
              disabled={busy}
              accept=".pdf,.xlsx,.xls,.csv,.ods,.docx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Check and fix anything below, then save. {items.length} items found.</p>
            {items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Type"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={it.type}
                    onChange={(e) => update(i, { type: e.target.value as ImportedItem["type"] })}
                  >
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <Input aria-label="Date" type="date" className="w-40" value={it.date} onChange={(e) => update(i, { date: e.target.value })} />
                  {it.type !== "note" ? (
                    <>
                      <Input aria-label="From" type="time" className="w-28" value={it.start_time ?? ""} onChange={(e) => update(i, { start_time: e.target.value || null })} />
                      <Input aria-label="To" type="time" className="w-28" value={it.end_time ?? ""} onChange={(e) => update(i, { end_time: e.target.value || null })} />
                    </>
                  ) : (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={it.important} onCheckedChange={(c) => update(i, { important: c === true })} /> Important
                    </label>
                  )}
                  <button className="ml-auto" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <Input aria-label="Title" value={it.title} onChange={(e) => update(i, { title: e.target.value })} />
                <Input aria-label="Details" placeholder="Details" value={it.details} onChange={(e) => update(i, { details: e.target.value })} />
              </div>
            ))}
            <div className="sticky bottom-0 flex gap-2 bg-background pt-2">
              <Button variant="outline" onClick={() => setItems(null)} disabled={busy}>Pick another file</Button>
              <Button className="flex-1" onClick={saveAll} disabled={busy || !items.length}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save {items.length} items
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
