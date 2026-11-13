import { describe, expect, it } from "vitest";
import { canMovePrepTask, canUseMisa, MISA_STAGES, misaTaskSchema } from "../lib/misa-workflow";

describe("Misa shared prep workflow", () => {
  it("allows staff to interact", () => { expect(canUseMisa("staff")).toBe(true); });
  it("allows managers to interact", () => { expect(canUseMisa("admin")).toBe(true); });
  it("excludes unauthenticated access", () => { expect(canUseMisa(null)).toBe(false); });
  it("supports exactly To do, In process and Ready", () => { expect(MISA_STAGES.map((s) => s.label)).toEqual(["To do", "In process", "Ready"]); });
  it("can send a ready task back to In process", () => { expect(canMovePrepTask("ready", "in_process")).toBe(true); });
  it("can send a ready task back to To do", () => { expect(canMovePrepTask("ready", "todo")).toBe(true); });
  it("rejects invalid stages", () => { expect(canMovePrepTask("ready", "archived")).toBe(false); expect(misaTaskSchema.safeParse({ title: "Prep", details: "", status: "archived" }).success).toBe(false); });
});
import { canEditMisa, nextStage, noteFields, prevStage } from "../lib/misa-workflow";
describe("Misa board rules", () => {
  it("staff cannot add, edit or delete", () => { expect(canEditMisa("staff")).toBe(false); });
  it("managers can add, edit and delete", () => { expect(canEditMisa("admin")).toBe(true); });
  it("advances To do → In process → Ready", () => { expect(nextStage("todo")).toBe("in_process"); expect(nextStage("in_process")).toBe("ready"); expect(nextStage("ready")).toBe(null); });
  it("moves back for mistakes", () => { expect(prevStage("ready")).toBe("in_process"); expect(prevStage("todo")).toBe(null); });
  it("stores the three note types", () => {
    expect(noteFields("important")).toEqual({ kind: "note", important: true });
    expect(noteFields("prep")).toEqual({ kind: "prep", important: false });
    expect(noteFields("event")).toEqual({ kind: "event", important: false });
  });
});
