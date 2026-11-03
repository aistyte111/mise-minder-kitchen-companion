import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  filename: z.string().max(300),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pdfBase64: z.string().max(15_000_000).nullable(),
  text: z.string().max(400_000).nullable(),
});

const itemSchema = z.object({
  type: z.enum(["shift", "prep", "event", "note"]),
  date: z.string().describe("YYYY-MM-DD"),
  title: z.string().describe("Person/station for shifts, task or event name; note text for notes"),
  start_time: z.string().nullable().describe("HH:MM 24h or null"),
  end_time: z.string().nullable().describe("HH:MM 24h or null"),
  details: z.string().describe("Extra details, empty string if none"),
  important: z.boolean().describe("Only meaningful for notes"),
});
const outputSchema = z.object({ items: z.array(itemSchema) });
export type ImportedItem = z.infer<typeof itemSchema>;

const INSTRUCTIONS = `You read restaurant kitchen schedules (rotas) and convert them into a list of items.
Types: "shift" = a person or station working a time slot (title = person name, add station/role in details);
"prep" = a prep task; "event" = a booking, delivery, private event, meeting; "note" = a general note for that day.
Rules: one item per person per day. Dates must be YYYY-MM-DD; infer the year and month from the document, or assume the nearest upcoming dates from today's date. Times as HH:MM 24-hour, null if unknown. Skip days off / empty cells. Do not invent anything not in the document.`;

export const readScheduleFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can import schedules.");
    if (!data.pdfBase64 && !data.text?.trim()) throw new Error("The file looks empty.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output, NoObjectGeneratedError } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const prompt = `Today is ${data.today}. File name: ${data.filename}. Extract every schedule item.`;
    const content = data.pdfBase64
      ? [
          { type: "text" as const, text: prompt },
          { type: "file" as const, filename: data.filename, data: data.pdfBase64, mediaType: "application/pdf" },
        ]
      : [{ type: "text" as const, text: `${prompt}\n\nFile contents:\n${data.text}` }];

    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        instructions: INSTRUCTIONS,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: outputSchema }),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const out = await result.output;
      return { items: out.items };
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) throw new Error("Couldn't understand this file. Try a clearer copy.");
      const status = (e as { statusCode?: number }).statusCode;
      console.error("schedule import failed", e);
      if (status === 402) throw new Error("AI credits have run out. Add credits in your workspace to keep using this.");
      if (status === 429) throw new Error("Too many requests right now. Please wait a minute and try again.");
      throw new Error("Couldn't read the file right now. Please try again.");
    }
  });
