import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookOpen, CalendarDays, ShieldAlert, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/today" });
  },
  head: () => ({
    meta: [
      { title: "Mise — Kitchen team log" },
      { name: "description", content: "One place for your kitchen's recipes, allergens, schedule and daily notes." },
      { property: "og:title", content: "Mise — Kitchen team log" },
      { property: "og:description", content: "One place for your kitchen's recipes, allergens, schedule and daily notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: BookOpen, label: "Recipes with photos" },
  { icon: ShieldAlert, label: "Allergens & guest notes" },
  { icon: CalendarDays, label: "Shifts, prep & events" },
  { icon: StickyNote, label: "Today & this week" },
];

function Landing() {
  return (
    <main className="flex min-h-screen flex-col bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sidebar-primary">Mise</p>
        <h1 className="mt-4 text-5xl leading-[1.05] text-sidebar-accent-foreground sm:text-7xl">
          Everything in its place.
        </h1>
        <p className="mt-6 max-w-lg text-lg text-sidebar-foreground/80">
          The kitchen's shared notebook — on every phone and on the pass computer.
        </p>
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="rounded-xl border border-sidebar-border bg-sidebar-accent p-4">
              <Icon className="h-5 w-5 text-sidebar-primary" />
              <p className="mt-3 text-sm font-medium">{label}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/auth">Sign in to the kitchen</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
