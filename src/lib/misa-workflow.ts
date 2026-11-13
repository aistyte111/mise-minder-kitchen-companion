import { z } from "zod";

export const MISA_STAGES = [
  { value: "todo", label: "To do" },
  { value: "in_process", label: "In process" },
  { value: "ready", label: "Ready" },
] as const;
export const misaStatus = z.enum(["todo", "in_process", "ready"]);
export type MisaStatus = z.infer<typeof misaStatus>;
export const prepImportSchema = z.object({ tasks: z.array(z.object({
  title: z.string().describe("Prep action exactly as written"),
  dish: z.string().describe("Dish or section heading, e.g. Salmon, Tartar; empty if absent"),
  allergens: z.array(z.string()).describe("Allergens from the allowed list only"),
  details: z.string().describe("Quantities, markings and handwritten notes; empty if absent"),
})) });
export type PrepImport = z.infer<typeof prepImportSchema>;
export const misaTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  details: z.string().max(10000),
  status: misaStatus,
});
export function canUseMisa(role: string | null) { return role === "staff" || role === "admin"; }
/** Only managers add, edit and delete Misa tasks, notes and files. */
export function canEditMisa(role: string | null) { return role === "admin"; }
export function canMovePrepTask(from: string, to: string) {
  return misaStatus.safeParse(from).success && misaStatus.safeParse(to).success;
}
const ORDER: MisaStatus[] = ["todo", "in_process", "ready"];
export function nextStage(s: MisaStatus): MisaStatus | null { return ORDER[ORDER.indexOf(s) + 1] ?? null; }
export function prevStage(s: MisaStatus): MisaStatus | null { const i = ORDER.indexOf(s); return i > 0 ? ORDER[i - 1] ?? null : null; }
export const NOTE_KINDS = [
  { value: "important", label: "Important note" },
  { value: "prep", label: "Prep note" },
  { value: "event", label: "Event note" },
] as const;
export type NoteChoice = (typeof NOTE_KINDS)[number]["value"];
/** Maps the form choice to stored note fields. */
export function noteFields(choice: NoteChoice): { kind: "note" | "prep" | "event"; important: boolean } {
  return choice === "important" ? { kind: "note", important: true } : { kind: choice, important: false };
}
export function noteLabel(kind: string, important: boolean) {
  if (important) return "Important"; if (kind === "prep") return "Prep"; if (kind === "event") return "Event"; return "Note";
}
export const PAGE_SIZE = 15;
