import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, LogOut, ShieldAlert, Sun, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { roleQuery } from "@/lib/kitchen";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

const nav = [
  { to: "/today", label: "Today", icon: Sun },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/allergies", label: "Allergies", icon: ShieldAlert },
] as const;

function Shell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: role } = useQuery(roleQuery);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar p-5 text-sidebar-foreground md:flex md:sticky md:top-0 md:h-screen">
        <p className="font-display text-3xl text-sidebar-accent-foreground">Mise</p>
        <p className="mt-1 text-xs uppercase tracking-widest text-sidebar-foreground/60">
          {role?.isAdmin ? "Manager · can edit" : "Staff · view only"}
        </p>
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-primary" }}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
          {role?.isAdmin && <Link to="/team" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-sidebar-primary" }}><Users className="h-4 w-4" />Team access</Link>}
        </nav>
        <Button variant="ghost" onClick={signOut} className="mt-auto justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </aside>

      <header className="flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <p className="font-display text-2xl text-sidebar-accent-foreground">Mise</p>
        <div className="flex items-center gap-2">{role?.isAdmin && <Button asChild variant="ghost" size="icon"><Link to="/team" aria-label="Team access"><Users className="h-4 w-4" /></Link></Button>}
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" />
        </Button></div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-10 md:pt-10">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-sidebar-border bg-sidebar pt-2 text-sidebar-foreground md:hidden">
        {nav.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-1 py-1 text-[11px] font-medium"
            activeProps={{ className: "text-sidebar-primary" }}
          >
            <Icon className="h-5 w-5" /> {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
