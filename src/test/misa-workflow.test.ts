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