import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { addDays, formatDay, formatTime, guestAllergiesQuery, notesQuery, scheduleQuery, toISODate } from "@/lib/kitchen";
import { AllergenBadges, EmptyState } from "@/components/kitchen/ui-bits";
import { cn } from "@/lib/utils";

const range = () => {
  const t = new Date();
  return { from: toISODate(t), to: toISODate(addDays(t, 7)) };
};

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Today — Mise" },
      { name: "description", content: "Today's important notes, shifts and guest allergies, plus the week ahead." },
      { property: "og:title", content: "Today — Mise" },
      { property: "og:description", content: "Today's important notes, shifts and guest allergies, plus the week ahead." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    const { from, to } = range();
    await Promise.all([
      context.queryClient.ensureQueryData(notesQuery(from, to)),
      context.queryClient.ensureQueryData(scheduleQuery(from, to)),
      context.queryClient.ensureQueryData(guestAllergiesQuery(from)),
    ]);
  },
  component: TodayPage,
});

function TodayPage() {
  const { from, to } = range();
  const { data: notes } = useSuspenseQuery(notesQuery(from, to));
  const { data: items } = useSuspenseQuery(scheduleQuery(from, to));
  const { data: guests } = useSuspenseQuery(guestAllergiesQuery(from));

  const todayNotes = notes.filter((n) => n.note_date === from);
  const todayItems = items.filter((i) => i.item_date === from);
  const todayGuests = guests.filter((g) => g.service_date === from);
  const weekImportant = notes.filter((n) => n.note_date !== from && n.important);
  const weekEvents = items.filter((i) => i.item_date !== from && i.kind !== "shift");

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
        {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1 className="mt-1 text-4xl md:text-5xl">Today in the kitchen</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card title="Notes for today">
          {todayNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes today.</p>
          ) : (
            <ul className="space-y-2">
              {todayNotes.map((n) => (
                <li key={n.id} className={cn("whitespace-pre-wrap rounded-lg p-3 text-sm", n.important ? "bg-warning/50 font-medium" : "bg-muted")}>
                  {n.important && "⚠ "}
                  {n.body}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Guest allergies today" accent>
          {todayGuests.length === 0 ? (
            <p className="text-sm text-muted-foreground">None logged.</p>
          ) : (
            <ul className="space-y-3">
              {todayGuests.map((g) => (
                <li key={g.id}>
                  <p className="font-semibold">{g.guest}</p>
                  <AllergenBadges items={g.allergens} className="mt-1" />
                  {g.details && <p className="mt-1 text-sm text-muted-foreground">{g.details}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="On today">
          {todayItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y">
              {todayItems.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="font-medium">{i.title}</span>
                  <span className="text-muted-foreground">
                    {formatTime(i.start_time)}
                    {i.end_time && `–${formatTime(i.end_time)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Coming up this week">
          {weekImportant.length === 0 && weekEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">A quiet week ahead.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {weekImportant.map((n) => (
                <li key={n.id} className="rounded-lg bg-warning/40 p-2">
                  <span className="font-semibold">{formatDay(n.note_date)}:</span> {n.body}
                </li>
              ))}
              {weekEvents.map((i) => (
                <li key={i.id} className="rounded-lg bg-muted p-2">
                  <span className="font-semibold">{formatDay(i.item_date)}:</span> {i.title}
                </li>
              ))}
            </ul>
          )}
          <Link to="/schedule" className="mt-4 inline-block text-sm font-medium text-primary">
            Full schedule →
          </Link>
        </Card>
      </div>
      {notes.length + items.length + guests.length === 0 && (
        <div className="mt-6">
          <EmptyState>Your head chef hasn't posted anything yet.</EmptyState>
        </div>
      )}
    </>
  );
}

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section className={cn("rounded-2xl bg-card p-5 shadow-card", accent && "border-l-4 border-primary")}>
      <h2 className="mb-3 text-2xl">{title}</h2>
      {children}
    </section>
  );
}
