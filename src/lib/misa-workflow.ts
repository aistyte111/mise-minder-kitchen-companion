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
  group: z.string().describe("Dish or section heading, empty if absent"),
  details: z.string().describe("Quantities, allergy annotations and handwritten notes; empty if absent"),
})) });
export type PrepImport = z.infer<typeof prepImportSchema>;
export const misaTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  details: z.string().max(10000),
  status: misaStatus,
});
export function canUseMisa(role: string | null) { return role === "staff" || role === "admin"; }
export function canMovePrepTask(from: string, to: string) {
  return misaStatus.safeParse(from).success && misaStatus.safeParse(to).success;
}