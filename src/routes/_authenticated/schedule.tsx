import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { ScheduleImportDialog } from "@/components/kitchen/ScheduleImport";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  addDays,
  formatDay,
  formatTime,
  notesQuery,
  roleQuery,
  SCHEDULE_KINDS,
  scheduleQuery,
  toISODate,
} from "@/lib/kitchen";
import { PageHeader } from "@/components/kitchen/ui-bits";
import { cn } from "@/lib/utils";

const range = () => {
  const t = new Date();
  return { from: toISODate(t), to: toISODate(addDays(t, 20)) };
};

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — Mise" },
      { name: "description", content: "Shifts, prep tasks, events and notes for the next three weeks." },
      { property: "og:title", content: "Schedule — Mise" },
      { property: "og:description", content: "Shifts, prep tasks, events and notes for the next three weeks." },
    ],
  }),
  loader: async ({ context }) => {
    const { from, to } = range();
    await Promise.all([
      context.queryClient.ensureQueryData(scheduleQuery(from, to)),
      context.queryClient.ensureQueryData(notesQuery(from, to)),
    ]);
  },
  component: SchedulePage,
});

const kindStyle: Record<string, string> = {
  shift: "bg-secondary text-secondary-foreground",
  prep: "bg-herb text-herb-foreground",
  event: "bg-primary text-primary-foreground",
};

function SchedulePage() {
  const { from, to } = range();
  const { data: items } = useSuspenseQuery(scheduleQuery(from, to));
  const { data: notes } = useSuspenseQuery(notesQuery(from, to));
  const { data: role } = useQuery(roleQuery);
  const [dialog, setDialog] = useState<null | "item" | "note" | "import">(null);
  const qc = useQueryClient();

  const days = Array.from({ length: 21 }, (_, i) => toISODate(addDays(new Date(), i)));

  async function del(table: "schedule_items" | "notes", id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: [table === "notes" ? "notes" : "schedule"] });
  }

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Next three weeks"
        action={
          role?.isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog("import")}>
                <FileUp className="h-4 w-4" /> Upload file
              </Button>
              <Button variant="outline" onClick={() => setDialog("note")}>
                <Plus className="h-4 w-4" /> Note
              </Button>
              <Button onClick={() => setDialog("item")}>
                <Plus className="h-4 w-4" /> Shift / task
              </Button>
            </div>
          )
        }
      />
      <div className="space-y-3">
        {days.map((d, i) => {
          const dayItems = items.filter((x) => x.item_date === d);
          const dayNotes = notes.filter((x) => x.note_date === d);
          const empty = !dayItems.length && !dayNotes.length;
          return (
            <section key={d} className={cn("rounded-2xl bg-card p-4 shadow-card", empty && "opacity-60")}>
              <h2 className="text-xl">
                {i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDay(d)}
                {i < 2 && <span className="ml-2 font-sans text-sm text-muted-foreground">{formatDay(d)}</span>}
              </h2>
              {empty && <p className="mt-1 text-sm text-muted-foreground">Nothing planned</p>}
              <ul className="mt-2 space-y-2">
                {dayNotes.map((n) => (
                  <li
                    key={n.id}
                    className={cn("flex items-start gap-2 rounded-lg p-3 text-sm", n.important ? "bg-warning/50 font-medium" : "bg-muted")}
                  >
                    <span className="flex-1 whitespace-pre-wrap">{n.important && "⚠ "}{n.body}</span>
                    {role?.isAdmin && (
                      <button onClick={() => del("notes", n.id)} aria-label="Delete note">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </li>
                ))}
                {dayItems.map((it) => (
                  <li key={it.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", kindStyle[it.kind])}>
                      {SCHEDULE_KINDS.find((k) => k.value === it.kind)?.label ?? it.kind}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium">{it.title}</p>
                      {(it.start_time || it.end_time) && (
                        <p className="text-muted-foreground">
                          {formatTime(it.start_time)}
                          {it.end_time && ` – ${formatTime(it.end_time)}`}
                        </p>
                      )}
                      {it.details && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{it.details}</p>}
                    </div>
                    {role?.isAdmin && (
                      <button onClick={() => del("schedule_items", it.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {dialog === "item" && <ItemDialog onClose={() => setDialog(null)} />}
      {dialog === "note" && <NoteDialog onClose={() => setDialog(null)} />}
      {dialog === "import" && <ScheduleImportDialog onClose={() => setDialog(null)} />}
    </>
  );
}

function ItemDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ kind: "shift", title: "", item_date: toISODate(new Date()), start_time: "", end_time: "", details: "" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("schedule_items").insert({
      ...f,
      start_time: f.start_time || null,
      end_time: f.end_time || null,
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["schedule"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Add to schedule</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_KINDS.map((k) => (
              <button
                type="button"
                key={k.value}
                onClick={() => setF({ ...f, kind: k.value })}
                className={cn("flex-1 rounded-lg border py-2 text-sm", f.kind === k.value && "border-primary bg-primary text-primary-foreground")}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t">{f.kind === "shift" ? "Who / station" : "What"}</Label>
            <Input id="t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 space-y-1.5 sm:col-span-1">
              <Label htmlFor="d">Date</Label>
              <Input id="d" type="date" value={f.item_date} onChange={(e) => setF({ ...f, item_date: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s">From</Label>
              <Input id="s" type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e">To</Label>
              <Input id="e" type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="det">Details</Label>
            <Textarea id="det" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ note_date: toISODate(new Date()), body: "", important: false });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("notes").insert(f);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["notes"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Note for the team</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nd">Day</Label>
            <Input id="nd" type="date" value={f.note_date} onChange={(e) => setF({ ...f, note_date: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nb">Note</Label>
            <Textarea id="nb" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.important} onCheckedChange={(c) => setF({ ...f, important: c === true })} />
            Mark as important
          </label>
          <Button type="submit" className="w-full">Post note</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
