import { memo, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, ClipboardList, Download, FileUp, Paperclip, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MisaImport, attachMisaFiles } from "@/components/kitchen/MisaImport";
import { AllergenPicker } from "@/components/kitchen/ui-bits";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { addDays, formatDay, misaBoardProjectId, misaSourcesQuery, misaTasksQuery, notesQuery, roleQuery, toISODate } from "@/lib/kitchen";
import { MISA_STAGES, NOTE_KINDS, PAGE_SIZE, misaTaskSchema, nextStage, noteFields, noteLabel, prevStage, type MisaStatus, type NoteChoice } from "@/lib/misa-workflow";
import { cn } from "@/lib/utils";

type Task = Tables<"misa_tasks">;
type Source = Tables<"misa_sources">;
type Note = Tables<"notes">;
type Pending = { label: string; title: string; run: () => Promise<void> } | null;

export const Route = createFileRoute("/_authenticated/misa")({
  head: () => ({ meta: [
    { title: "Misa — Mise kitchen prep board" }, { name: "description", content: "One shared kitchen prep board with notes, source lists and task progress." },
    { property: "og:title", content: "Misa — Mise kitchen prep board" }, { property: "og:description", content: "One shared kitchen prep board with notes, source lists and task progress." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(misaTasksQuery), context.queryClient.ensureQueryData(roleQuery)]),
  component: MisaPage,
});

function MisaPage() {
  const { data: tasks } = useSuspenseQuery(misaTasksQuery);
  const { data: role } = useSuspenseQuery(roleQuery);
  const { data: sources = [] } = useQuery(misaSourcesQuery);
  const admin = role.isAdmin;
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [editor, setEditor] = useState<{ task?: Task } | null>(null);
  const [preview, setPreview] = useState<Source | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [dish, setDish] = useState("all");
  const [search, setSearch] = useState("");
  const [mobileStage, setMobileStage] = useState<MisaStatus>("todo");
  const [pending, setPending] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const dishes = useMemo(() => [...new Set(tasks.map((t) => t.dish.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [tasks]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => (dish === "all" || t.dish.trim() === dish) && (!q || t.title.toLowerCase().includes(q)));
  }, [tasks, dish, search]);
  const byStage = useMemo(() => {
    const m: Record<MisaStatus, Task[]> = { todo: [], in_process: [], ready: [] };
    for (const t of filtered) (m[t.status as MisaStatus] ?? m.todo).push(t);
    return m;
  }, [filtered]);
  const ready = tasks.filter((t) => t.status === "ready").length;

  async function move(task: Task, status: MisaStatus) {
    setPending(task.id);
    qc.setQueryData<Task[]>(misaTasksQuery.queryKey, (cur) => cur?.map((t) => t.id === task.id ? { ...t, status } : t));
    const { error } = await supabase.from("misa_tasks").update({ status }).eq("id", task.id).eq("status", task.status).select().single();
    if (error) { toast.error("This task changed or could not be moved. Refreshing the list."); await qc.invalidateQueries({ queryKey: misaTasksQuery.queryKey }); }
    setPending(null);
  }
  function askDeleteTask(task: Task) {
    setConfirm({ label: "Delete this task?", title: task.title, run: async () => {
      const { error } = await supabase.from("misa_tasks").delete().eq("id", task.id);
      if (error) throw error;
      qc.setQueryData<Task[]>(misaTasksQuery.queryKey, (cur) => cur?.filter((t) => t.id !== task.id));
      toast.success("Task deleted");
    } });
  }
  function askDeleteSource(s: Source) {
    setConfirm({ label: "Delete this attachment?", title: s.filename, run: async () => {
      const { error } = await supabase.from("misa_sources").delete().eq("id", s.id);
      if (error) throw error;
      await supabase.storage.from("misa-files").remove([s.storage_path]);
      await qc.invalidateQueries({ queryKey: misaSourcesQuery.queryKey }); setPreview(null);
      toast.success("Attachment deleted");
    } });
  }
  async function attach(files: File[]) {
    setAttaching(true);
    try { await attachMisaFiles(files); await qc.invalidateQueries({ queryKey: misaSourcesQuery.queryKey }); toast.success("File attached"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not attach the file."); }
    finally { setAttaching(false); }
  }

  return <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Kitchen prep</p><h1 className="mt-1 text-4xl md:text-5xl">Misa</h1></div>
      {admin && <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Import list</Button>
        <Button variant="outline" asChild disabled={attaching}><label className="cursor-pointer"><Paperclip className="h-4 w-4" />{attaching ? "Attaching…" : "Attach file"}<input type="file" multiple className="sr-only" aria-label="Attach file" onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) void attach(f); e.target.value = ""; }} /></label></Button>
        <Button onClick={() => setEditor({})}><Plus className="h-4 w-4" />Add task</Button>
      </div>}
    </div>
    <div className="mt-5 max-w-md"><p className="text-sm text-muted-foreground">{ready} / {tasks.length} ready</p><Progress className="mt-2 h-1.5" value={tasks.length ? (ready / tasks.length) * 100 : 0} aria-label="Prep progress" /></div>
    {!!sources.length && <div className="mt-4 flex flex-wrap gap-2">{sources.map((s) => <Button key={s.id} variant="ghost" size="sm" className="h-auto max-w-full justify-start whitespace-normal break-all text-left" onClick={() => setPreview(s)}><Paperclip className="h-4 w-4 shrink-0" />{s.filename}</Button>)}</div>}

    <NotesSection admin={admin} onDelete={setConfirm} />

    <div className="mt-8 flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search tasks" aria-label="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Select value={dish} onValueChange={setDish}><SelectTrigger className="w-48" aria-label="Filter by dish"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All dishes</SelectItem>{dishes.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
    </div>

    {!tasks.length ? <div className="mt-10 flex flex-col items-center gap-3 border-y py-14 text-center"><ClipboardList className="h-10 w-10 text-primary" /><p className="text-lg">No prep tasks yet.{admin && " Import a list or add a task."}</p></div> : <>
      <div role="tablist" aria-label="Prep stages" className="mt-6 grid grid-cols-3 border-b lg:hidden">{MISA_STAGES.map((s) => <Button key={s.value} role="tab" aria-selected={mobileStage === s.value} variant="ghost" className={cn("rounded-none text-xs", mobileStage === s.value && "border-b-2 border-primary text-primary")} onClick={() => setMobileStage(s.value)}>{s.label} · {byStage[s.value].length}</Button>)}</div>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">{MISA_STAGES.map((s) => <Column key={s.value} stage={s.value} label={s.label} list={byStage[s.value]} hidden={mobileStage !== s.value} admin={admin} pending={pending} onMove={move} onEdit={(task) => setEditor({ task })} onDelete={askDeleteTask} />)}</div>
    </>}

    {importing && <MisaImport onClose={() => setImporting(false)} />}
    {editor && <TaskEditor task={editor.task} dishes={dishes} onClose={() => setEditor(null)} />}
    {preview && <AttachmentPreview source={preview} admin={admin} onClose={() => setPreview(null)} onDelete={() => askDeleteSource(preview)} />}
    <ConfirmDelete pending={confirm} onClose={() => setConfirm(null)} />
  </>;
}

function Column({ stage, label, list, hidden, admin, pending, onMove, onEdit, onDelete }: { stage: MisaStatus; label: string; list: Task[]; hidden: boolean; admin: boolean; pending: string | null; onMove: (t: Task, s: MisaStatus) => void; onEdit: (t: Task) => void; onDelete: (t: Task) => void }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = list.slice(0, limit);
  return <section aria-label={label} className={cn("min-w-0", hidden && "hidden lg:block")}>
    <div className={cn("mb-4 flex items-center justify-between border-t-4 pt-3", stage === "ready" ? "border-herb" : stage === "in_process" ? "border-warning" : "border-primary")}><h3 className="text-xl">{label}</h3><span className="text-sm tabular-nums text-muted-foreground">{list.length}</span></div>
    <div className="space-y-3">
      {shown.length ? shown.map((t) => <TaskCard key={t.id} task={t} admin={admin} busy={pending === t.id} onMove={onMove} onEdit={onEdit} onDelete={onDelete} />) : <p className="border-b py-4 text-sm text-muted-foreground">No tasks</p>}
      {list.length > limit && <Button variant="outline" className="w-full" onClick={() => setLimit(limit + PAGE_SIZE)}>Show more ({list.length - limit})</Button>}
    </div>
  </section>;
}

const TaskCard = memo(function TaskCard({ task, admin, busy, onMove, onEdit, onDelete }: { task: Task; admin: boolean; busy: boolean; onMove: (t: Task, s: MisaStatus) => void; onEdit: (t: Task) => void; onDelete: (t: Task) => void }) {
  const status = task.status as MisaStatus;
  const next = nextStage(status); const prev = prevStage(status);
  return <article className="rounded-lg border bg-card p-4 shadow-card">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0">{task.dish && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{task.dish}</p>}<p className="break-words font-semibold">{task.title}</p></div>
      {admin && <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)}><Pencil className="h-3.5 w-3.5" /></Button>}</div>
    {!!task.allergens.length && <div className="mt-2 flex flex-wrap gap-1">{task.allergens.map((a) => <span key={a} className="rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground">{a}</span>)}</div>}
    {task.details && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{task.details}</p>}
    <div className="mt-4 flex items-center gap-2">
      {prev && <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={busy} aria-label={`Move ${task.title} back`} onClick={() => onMove(task, prev)}><ArrowLeft className="h-3.5 w-3.5" />Back</Button>}
      {next && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} aria-label={next === "ready" ? `Mark ${task.title} ready` : `Start ${task.title}`} onClick={() => onMove(task, next)}>{next === "ready" ? <><Check className="h-4 w-4" />Ready</> : <><ArrowRight className="h-4 w-4" />Start</>}</Button>}
      {admin && <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 shrink-0" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task)}><Trash2 className="h-3.5 w-3.5" /></Button>}
    </div>
  </article>;
});

function NotesSection({ admin, onDelete }: { admin: boolean; onDelete: (p: Pending) => void }) {
  const from = toISODate(new Date()); const to = toISODate(addDays(new Date(), 7));
  const { data: notes = [], isLoading, error } = useQuery(notesQuery(from, to));
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const days = useMemo(() => { const m = new Map<string, Note[]>(); for (const n of notes) m.set(n.note_date, [...(m.get(n.note_date) ?? []), n]); return [...m]; }, [notes]);
  return <section className="mt-8 rounded-lg border bg-card p-4 shadow-card" aria-label="Notes">
    <div className="flex items-center justify-between gap-2"><h2 className="text-2xl">Notes</h2>{admin && <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add note</Button>}</div>
    {isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading notes…</p> : error ? <p className="mt-3 text-sm text-destructive">Could not load notes.</p> : !days.length ? <p className="mt-3 text-sm text-muted-foreground">No notes for the next 7 days.</p> :
      <div className="mt-3 space-y-4">{days.map(([day, list]) => <div key={day}><h3 className="text-sm font-semibold text-muted-foreground">{day === from ? "Today" : formatDay(day)}</h3><ul className="mt-2 space-y-2">{list.map((n) => <li key={n.id} className={cn("flex items-start gap-2 rounded-lg p-3 text-sm", n.important ? "bg-warning/50 font-medium" : "bg-muted")}>
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words"><span className="mr-2 text-xs font-semibold uppercase tracking-wide text-primary">{n.important && "⚠ "}{noteLabel(n.kind, n.important)}</span>{n.body}</div>
        {admin && <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Delete note" onClick={() => onDelete({ label: "Delete this note?", title: n.body.slice(0, 120), run: async () => { const { error } = await supabase.from("notes").delete().eq("id", n.id); if (error) throw error; await qc.invalidateQueries({ queryKey: ["notes"] }); toast.success("Note deleted"); } })}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </li>)}</ul></div>)}</div>}
    {adding && <NoteEditor onClose={() => setAdding(false)} />}
  </section>;
}

function NoteEditor({ onClose }: { onClose: () => void }) {
  const [choice, setChoice] = useState<NoteChoice>("important");
  const [date, setDate] = useState(toISODate(new Date()));
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("notes").insert({ note_date: date, body: body.trim(), ...noteFields(choice) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["notes"] }); toast.success("Note added"); onClose();
  }
  return <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Add note</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4">
    <div><Label>Type</Label><Select value={choice} onValueChange={(v) => setChoice(v as NoteChoice)}><SelectTrigger className="mt-2" aria-label="Note type"><SelectValue /></SelectTrigger><SelectContent>{NOTE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></div>
    <div><Label htmlFor="note-date">Date</Label><Input id="note-date" className="mt-2" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
    <div><Label htmlFor="note-body">Text</Label><Textarea id="note-body" className="mt-2" required maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
    <Button type="submit" disabled={busy || !body.trim()}>Save note</Button>
  </form></DialogContent></Dialog>;
}

function TaskEditor({ task, dishes, onClose }: { task: Task | undefined; dishes: string[]; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [dish, setDish] = useState(task?.dish ?? "");
  const [allergens, setAllergens] = useState<string[]>(task?.allergens ?? []);
  const [details, setDetails] = useState(task?.details ?? "");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const row = misaTaskSchema.parse({ title, details, status: task?.status ?? "todo" });
      const fields = { title: row.title, details: row.details, dish: dish.trim(), allergens };
      const result = task ? await supabase.from("misa_tasks").update(fields).eq("id", task.id) : await supabase.from("misa_tasks").insert({ ...fields, status: row.status, project_id: await misaBoardProjectId() });
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: misaTasksQuery.queryKey }); toast.success(task ? "Task saved" : "Task added"); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save task."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{task ? "Edit prep task" : "New prep task"}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4">
    <div><Label htmlFor="task-name">Task name</Label><Input id="task-name" className="mt-2" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
    <div><Label htmlFor="task-dish">Dish</Label><Input id="task-dish" className="mt-2" list="misa-dishes" maxLength={200} value={dish} onChange={(e) => setDish(e.target.value)} placeholder="e.g. Salmon" /><datalist id="misa-dishes">{dishes.map((d) => <option key={d} value={d} />)}</datalist></div>
    <div><Label>Allergens</Label><div className="mt-2"><AllergenPicker value={allergens} onChange={setAllergens} /></div></div>
    <div><Label htmlFor="task-details">Notes</Label><Textarea id="task-details" className="mt-2" rows={4} maxLength={10000} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
    <Button disabled={busy || !title.trim()} type="submit">Save task</Button>
  </form></DialogContent></Dialog>;
}

function AttachmentPreview({ source, admin, onClose, onDelete }: { source: Source; admin: boolean; onClose: () => void; onDelete: () => void }) {
  const { data: url, isLoading, error } = useQuery({ queryKey: ["misa", "signed", source.storage_path], staleTime: 240000, queryFn: async () => {
    const { data, error } = await supabase.storage.from("misa-files").createSignedUrl(source.storage_path, 300);
    if (error || !data) throw error ?? new Error("No URL"); return data.signedUrl;
  } });
  const ext = source.filename.toLowerCase().split(".").pop() ?? "";
  const image = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext); const pdf = ext === "pdf";
  return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle className="break-all pr-6">{source.filename}</DialogTitle></DialogHeader>
    {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : error || !url ? <p className="text-sm text-destructive">Could not open this file.</p> :
      image ? <div className="overflow-auto" style={{ touchAction: "pinch-zoom" }}><img src={url} alt={source.filename} className="h-auto w-full" /></div> :
      pdf ? <iframe src={url} title={source.filename} className="h-[70vh] w-full rounded border" /> :
      <p className="text-sm text-muted-foreground">This file can't be previewed here. Download it to open.</p>}
    <div className="flex flex-wrap gap-2">{url && <Button asChild variant="outline"><a href={url} target="_blank" rel="noopener noreferrer" download={source.filename}><Download className="h-4 w-4" />Download</a></Button>}{admin && <Button variant="destructive" onClick={onDelete}><Trash2 className="h-4 w-4" />Delete attachment</Button>}</div>
  </DialogContent></Dialog>;
}

function ConfirmDelete({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) onClose(); }}><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{pending?.label}</AlertDialogTitle><AlertDialogDescription className="break-words">{pending?.title}</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); if (!pending) return; setBusy(true); pending.run().then(onClose, (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not delete.")).finally(() => setBusy(false)); }}>Delete</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
