import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ALLERGENS } from "@/lib/kitchen";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function AllergenBadges({ items, className }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((a) => (
        <span key={a} className="rounded-full bg-warning px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
          {a}
        </span>
      ))}
    </div>
  );
}

export function AllergenPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALLERGENS.map((a) => {
        const on = value.includes(a);
        return (
          <button
            type="button"
            key={a}
            onClick={() => onChange(on ? value.filter((x) => x !== a) : [...value, a])}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              on ? "border-warning bg-warning font-semibold text-warning-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {a}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center text-muted-foreground">{children}</div>
  );
}
