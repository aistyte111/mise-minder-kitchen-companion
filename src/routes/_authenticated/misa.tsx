import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ClipboardList, FileUp, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MisaImport } from "@/components/kitchen/MisaImport";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { misaProjectsQuery, misaSourcesQuery, misaTasksQuery } from "@/lib/kitchen";
import { MISA_STAGES, misaTaskSchema, type MisaStatus } from "@/lib/misa-workflow";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/misa")({
  head: () => ({ meta: [
    { title: "Misa — Mise prep projects" }, { name: "description", content: "Shared kitchen prep projects, source lists and task progress." },
    { property: "og:title", content: "Misa — Mise prep projects" }, { property: "og:description", content: "Shared kitchen prep projects, source lists and task progress." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(misaProjectsQuery),
  component: MisaPage,
});

function MisaPage() {
  const { data: projects } = useSuspenseQuery(misaProjectsQuery);
  const [selected, setSelected] = useState("");
  const [newProject, setNewProject] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const project = projects.find((p) => p.id === selected) ?? projects[0];
  async function createProject(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim()) return; setSaving(true);
    try {
      const { data, error } = await supabase.from("misa_projects").insert({ title: name.trim() }).select().single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["misa"] }); setSelected(data.id); setNewProject(false); setName("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create project."); }
    finally { setSaving(false); }
  }
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Kitchen prep</p><h1 className="mt-1 text-4xl md:text-5xl">Misa</h1></div><Button onClick={() => setNewProject(true)}><Plus className="h-4 w-4" />New project</Button></div>
    {projects.length ? <div className="mt-7"><div className="max-w-sm"><Label>Project</Label><Select value={project?.id ?? ""} onValueChange={setSelected}><SelectTrigger className="mt-2" aria-label="Project"><SelectValue /></SelectTrigger><SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></div>{project && <PrepBoard key={project.id} project={project} />}</div> : <div className="mt-14 flex flex-col items-center gap-3 border-y py-14 text-center"><ClipboardList className="h-10 w-10 text-primary" /><h2 className="text-2xl">No prep projects yet</h2><Button variant="outline" onClick={() => setNewProject(true)}><Plus className="h-4 w-4" />New project</Button></div>}
    <Dialog open={newProject} onOpenChange={setNewProject}><DialogContent><DialogHeader><DialogTitle>New prep project</DialogTitle></DialogHeader><form onSubmit={createProject} className="space-y-4"><Label htmlFor="project-name">Project name</Label><Input id="project-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dinner service / weekly prep" /><Button type="submit" disabled={saving || !name.trim()}>Create project</Button></form></DialogContent></Dialog>
  </>;
}

function PrepBoard({ project }: { project: Tables<"misa_projects"> }) {
  const { data: tasks = [] } = useQuery(misaTasksQuery(project.id));
  const { data: sources = [] } = useQuery(misaSourcesQuery(project.id));
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [editor, setEditor] = useState<{ task?: Tables<"misa_tasks"> } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [mobileStage, setMobileStage] = useState<MisaStatus>("todo");
  async function move(task: Tables<"misa_tasks">, status: MisaStatus) {
    setPending(task.id);
    const { error } = await supabase.from("misa_tasks").update({ status }).eq("id", task.id).eq("status", task.status).select().single();
    if (error) toast.error("This task changed or could not be moved. Refreshing the list.");
    await qc.invalidateQueries({ queryKey: ["misa", "tasks", project.id] }); setPending(null);
  }
  async function remove(task: Tables<"misa_tasks">) {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    const { error } = await supabase.from("misa_tasks").delete().eq("id", task.id);
    if (error) toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["misa", "tasks", project.id] });
  }
  async function openSource(path: string) {
    const { data, error } = await supabase.storage.from("misa-files").createSignedUrl(path, 300);
    if (error || !data) { toast.error("Could not open the source file."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const ready = tasks.filter((t) => t.status === "ready").length;
  return <>
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><div><h2 className="break-words text-2xl">{project.title}</h2><p className="mt-1 text-sm text-muted-foreground">{ready} / {tasks.length} ready</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setImporting(true)}><FileUp className="h-4 w-4" />Import list</Button><Button onClick={() => setEditor({})}><Plus className="h-4 w-4" />Add task</Button></div></div>
    {!!sources.length && <div className="mt-4 flex flex-wrap gap-2">{sources.map((s) => <Button key={s.id} variant="ghost" size="sm" className="h-auto max-w-full justify-start whitespace-normal break-all text-left" onClick={() => void openSource(s.storage_path)}><Paperclip className="h-4 w-4 shrink-0" />{s.filename}</Button>)}</div>}
    <div role="tablist" aria-label="Prep stages" className="mt-6 grid grid-cols-3 border-b lg:hidden">{MISA_STAGES.map((stage) => <Button key={stage.value} role="tab" aria-selected={mobileStage === stage.value} variant="ghost" className={cn("rounded-none text-xs", mobileStage === stage.value && "border-b-2 border-primary text-primary")} onClick={() => setMobileStage(stage.value)}>{stage.label} · {tasks.filter((t) => t.status === stage.value).length}</Button>)}</div>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">{MISA_STAGES.map((stage) => {
      const list = tasks.filter((t) => t.status === stage.value);
      return <section key={stage.value} aria-label={stage.label} className={cn("min-w-0", mobileStage !== stage.value && "hidden lg:block")}><div className={cn("mb-4 flex items-center justify-between border-t-4 pt-3", stage.value === "ready" ? "border-herb" : stage.value === "in_process" ? "border-warning" : "border-primary")}><h3 className="text-xl">{stage.label}</h3><span className="text-sm tabular-nums text-muted-foreground">{list.length}</span></div><div className="space-y-3">{list.length ? list.map((task) => <article key={task.id} className="rounded-lg border bg-card p-4 shadow-card"><div className="flex items-start justify-between gap-2"><p className="min-w-0 break-words font-semibold">{task.title}</p><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`Edit ${task.title}`} onClick={() => setEditor({ task })}><Pencil className="h-3.5 w-3.5" /></Button></div>{task.details && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{task.details}</p>}<div className="mt-4 flex items-center gap-2"><Select value={task.status} disabled={pending === task.id} onValueChange={(value) => void move(task, value as MisaStatus)}><SelectTrigger aria-label={`Stage for ${task.title}`} className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{MISA_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>{stage.value !== "ready" && <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={pending === task.id} aria-label={stage.value === "todo" ? `Start ${task.title}` : `Mark ${task.title} ready`} onClick={() => void move(task, stage.value === "todo" ? "in_process" : "ready")}>{stage.value === "todo" ? <ArrowRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}</Button>}<Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Delete ${task.title}`} onClick={() => void remove(task)}><Trash2 className="h-3.5 w-3.5" /></Button></div></article>) : <p className="border-b py-4 text-sm text-muted-foreground">No tasks</p>}</div></section>;
    })}</div>
    {importing && <MisaImport projectId={project.id} onClose={() => setImporting(false)} />}
    {editor && <TaskEditor projectId={project.id} task={editor.task} onClose={() => setEditor(null)} />}
  </>;
}

function TaskEditor({ projectId, task, onClose }: { projectId: string; task: Tables<"misa_tasks"> | undefined; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [details, setDetails] = useState(task?.details ?? "");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const row = misaTaskSchema.parse({ title, details, status: task?.status ?? "todo" });
      const result = task ? await supabase.from("misa_tasks").update({ title: row.title, details: row.details }).eq("id", task.id) : await supabase.from("misa_tasks").insert({ ...row, project_id: projectId });
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["misa"] }); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save task."); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{task ? "Edit prep task" : "New prep task"}</DialogTitle></DialogHeader><form onSubmit={save} className="space-y-4"><div><Label htmlFor="task-name">Task</Label><Input id="task-name" className="mt-2" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} /></div><div><Label htmlFor="task-details">Details</Label><Textarea id="task-details" className="mt-2" rows={4} maxLength={10000} value={details} onChange={(e) => setDetails(e.target.value)} /></div><Button disabled={busy || !title.trim()} type="submit">Save task</Button></form></DialogContent></Dialog>;
}