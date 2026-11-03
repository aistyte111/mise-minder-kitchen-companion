import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALLERGENS } from "@/lib/kitchen";

const inputSchema = z.object({
  filename: z.string().max(300),
  fileBase64: z.string().max(15_000_000).nullable(),
  mediaType: z.string().max(100).nullable(),
  text: z.string().max(400_000).nullable(),
});

const outputSchema = z.object({
  title: z.string(),
  category: z.string().describe("e.g. Sauce, Starter, Dessert; empty if unknown"),
  servings: z.string().describe("Yield/portions as written; empty if unknown"),
  ingredients: z.string().describe("One ingredient per line with quantities"),
  instructions: z.string().describe("Method steps, one per line"),
  notes: z.string().describe("Any other notes; empty if none"),
  allergens: z.array(z.enum(ALLERGENS)),
});
export type ImportedRecipe = z.infer<typeof outputSchema>;

const INSTRUCTIONS = `You read recipes from photos (printed or handwritten), PDFs, Word or Excel files used in restaurant kitchens.
Transcribe faithfully in the original language. Do not invent ingredients or steps. Keep quantities and units exactly.
If the file has several recipes, return the first/main one and mention the others in notes.
Allergens: pick only from the allowed list, based on the ingredients actually present.`;

export const readRecipeFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can import recipes.");
    if (!data.fileBase64 && !data.text?.trim()) throw new Error("The file looks empty.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output, NoObjectGeneratedError } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const prompt = `File name: ${data.filename}. Read the recipe.`;
    const mt = data.mediaType ?? "";
    const content =
      data.fileBase64 && mt.startsWith("image/")
        ? [
            { type: "text" as const, text: prompt },
            { type: "image" as const, image: data.fileBase64, mediaType: mt },
          ]
        : data.fileBase64
          ? [
              { type: "text" as const, text: prompt },
              { type: "file" as const, filename: data.filename, data: data.fileBase64, mediaType: "application/pdf" },
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
      return await result.output;
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) throw new Error("Couldn't read a recipe from this file. Try a clearer copy.");
      const status = (e as { statusCode?: number }).statusCode;
      console.error("recipe import failed", e);
      if (status === 402) throw new Error("AI credits have run out. Add credits in your workspace to keep using this.");
      if (status === 429) throw new Error("Too many requests right now. Please wait a minute and try again.");
      throw new Error("Couldn't read the file right now. Please try again.");
    }
  });
