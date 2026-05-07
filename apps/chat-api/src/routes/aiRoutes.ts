import { Router } from "express";
import type { Request, Response } from "express";
import logger from "../logger";

/** Call a Foundry/OpenAI Responses-API-compatible endpoint */
export async function queryFoundryAi(
  endpoint: string,
  model: string,
  userPrompt: string,
  systemPrompt = "Du bist ein hilfsbereiter Chat-Bot."
): Promise<string> {
  if (!endpoint) throw new Error("AI endpoint not configured");
  const apiKey = String(process.env.FOUNDRY_AI_KEY || "").trim();
  const payload = {
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    model
  };

  logger.debug({ endpoint, model, userPrompt: userPrompt.slice(0, 120) }, "[AI] queryFoundryAi");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "api-key": apiKey, Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(payload)
  });

  logger.debug({ status: response.status, statusText: response.statusText }, "[AI] response status");
  const rawText = await response.text();
  if (!response.ok) throw new Error(`Foundry AI request failed: ${rawText}`);

  // Support Responses API (output[].type==="message") and Chat Completions API
  const data = JSON.parse(rawText) as {
    output?: Array<{ type?: string; content?: Array<{ text?: string }> }>;
    choices?: Array<{ message?: { content?: string }; text?: string }>;
  };
  const messageOutput = data.output?.find((o) => o.type === "message");
  const text =
    messageOutput?.content?.[0]?.text ||
    data.output?.[0]?.content?.[0]?.text ||
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.text ||
    "";
  return String(text);
}

export async function queryFoundryImage(model: string, prompt: string): Promise<string> {
  const endpoint = String(process.env.FOUNDRY_AI_IMAGE_ENDPOINT || "").trim();
  if (!endpoint) throw new Error("FOUNDRY_AI_IMAGE_ENDPOINT not configured");

  const apiKey = String(process.env.FOUNDRY_AI_KEY || "").trim();
  const payload = { model, prompt, size: "1024x1024" };

  logger.debug({ endpoint, model, prompt }, "[AI] queryFoundryImage");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "api-key": apiKey, Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(payload)
  });

  logger.debug({ status: response.status, statusText: response.statusText }, "[AI] response status");
  const rawText = await response.text();

  if (!response.ok) throw new Error(`Foundry AI image request failed: ${rawText}`);

  const data = JSON.parse(rawText) as { data?: Array<{ url?: string; b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;

  // Log the response body: full base64 only at TRACE, redacted at DEBUG
  if (logger.isLevelEnabled("trace")) {
    logger.trace({ body: rawText }, "[AI] image response body");
  } else {
    const redacted = b64
      ? rawText.replace(b64, "(Base64-encoded Byte String)")
      : rawText;
    logger.debug({ body: redacted }, "[AI] image response body");
  }
  if (b64) {
    // Detect actual image format from base64 magic bytes
    const mimeType = b64.startsWith("/9j/") ? "image/jpeg"
      : b64.startsWith("iVBOR") ? "image/png"
      : b64.startsWith("R0lGO") ? "image/gif"
      : b64.startsWith("UklGR") ? "image/webp"
      : "image/png";
    return `data:${mimeType};base64,${b64}`;
  }
  const urlResult = data.data?.[0]?.url;
  if (!urlResult) throw new Error("No image returned by AI service");
  return String(urlResult);
}

const ACTION_SYSTEM_PROMPT = `Du ermittelst die Intention eines Nutzers aus einem Satz. Antworte ausschließlich mit JSON, ohne Markdown-Formatierung oder Erklärungen.

Mögliche Intentionen:
- PreviousChat: Der Nutzer möchte, dass du die vorherige Chat-Nachricht kommentierst oder erklärst (z. B. "Was sagst du dazu?", "Was hältst du davon?", "Erkläre das")
- PreviousImage: Der Nutzer möchte ein Bild zur vorherigen Chat-Nachricht (z. B. "Erstelle dazu ein Bild", "Kannst du das visualisieren?")
- CurrentChat: Der Nutzer möchte Informationen zu einem konkreten Thema/Begriff/Satz (z. B. "Was sagst du zu <Thema>?", "Erkläre mir <Thema>", "Was weißt du über <Thema>?")
- CurrentImage: Der Nutzer möchte ein Bild zu einem konkreten Thema (z. B. "Erstelle ein Bild von <Thema>", "Zeig mir <Thema>")
- None: Keine der obigen Intentionen ist zuverlässig erkennbar

Antwortformat (genau eines davon):
{"intent":"PreviousChat"}
{"intent":"PreviousImage"}
{"intent":"CurrentChat","topic":"<das genannte Thema>"}
{"intent":"CurrentImage","topic":"<das genannte Thema>"}
{"intent":"None"}`;

export function createAiRouter(): Router {
  const router = Router();

  router.post("/chat", async (req: Request, res: Response) => {
    const prompt = String((req.body as { prompt?: string }).prompt || "").trim();
    if (!prompt) { res.status(400).json({ ok: false, error: "prompt is required" }); return; }
    try {
      const endpoint = String(process.env.FOUNDRY_AI_CHAT_ENDPOINT || "").trim();
      const model = String(process.env.FOUNDRY_AI_CHAT_DEPLOYMENT || "").trim();
      if (!endpoint || !model) throw new Error("FOUNDRY_AI_CHAT_ENDPOINT / FOUNDRY_AI_CHAT_DEPLOYMENT not configured");
      const aiResponse = await queryFoundryAi(endpoint, model, prompt);
      res.json({ ok: true, response: aiResponse });
    } catch (error) {
      res.status(500).json({ ok: false, error: (error as Error).message || "AI request failed" });
    }
  });

  router.post("/action", async (req: Request, res: Response) => {
    const userText = String((req.body as { prompt?: string }).prompt || "").trim();
    if (!userText) { res.status(400).json({ ok: false, error: "prompt is required" }); return; }
    try {
      const endpoint = String(process.env.FOUNDRY_AI_ACTION_ENDPOINT || "").trim();
      const model = String(process.env.FOUNDRY_AI_ACTION_DEPLOYMENT || "").trim();
      if (!endpoint || !model) throw new Error("FOUNDRY_AI_ACTION_ENDPOINT / FOUNDRY_AI_ACTION_DEPLOYMENT not configured");

      const rawJson = await queryFoundryAi(endpoint, model, userText, ACTION_SYSTEM_PROMPT);
      const cleaned = rawJson.replace(/^```[a-z]*\n?/i, "").replace(/```$/m, "").trim();
      let intent = "None";
      let topic: string | undefined;
      try {
        const parsed = JSON.parse(cleaned) as { intent?: string; topic?: string };
        intent = parsed.intent || "None";
        topic = parsed.topic;
      } catch {
        logger.warn({ rawJson }, "[AI/action] could not parse intent JSON");
      }
      res.json({ ok: true, intent, topic });
    } catch (error) {
      res.status(500).json({ ok: false, error: (error as Error).message || "AI action request failed" });
    }
  });

  router.post("/image", async (req: Request, res: Response) => {
    const prompt = String((req.body as { prompt?: string }).prompt || "").trim();
    if (!prompt) { res.status(400).json({ ok: false, error: "prompt is required" }); return; }
    try {
      const model = String(process.env.FOUNDRY_AI_IMAGE_DEPLOYMENT || "").trim();
      if (!model) throw new Error("FOUNDRY_AI_IMAGE_DEPLOYMENT not configured");
      const imageUrl = await queryFoundryImage(model, prompt);
      res.json({ ok: true, imageUrl });
    } catch (error) {
      res.status(500).json({ ok: false, error: (error as Error).message || "AI image request failed" });
    }
  });

  return router;
}
