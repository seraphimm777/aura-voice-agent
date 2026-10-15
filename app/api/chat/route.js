import { gemini, thinkingOff } from "@/lib/gemini";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { runTool, toolDeclarations } from "@/lib/orders";

export const maxDuration = 60; // seconds: allows the model fallback chain on Vercel

// Body: { messages: [{role:"user"|"agent", text}] } -> { reply, toolCalls }
export async function POST(req) {
  try {
    const { messages, cancelled: c = [] } = await req.json(); const cancelled = new Set(c);
    const contents = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));
    const toolCalls = [];

    for (let i = 0; i < 4; i++) { // agent loop: model may call tools before answering
      const data = await gemini({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{ functionDeclarations: toolDeclarations }],
        generationConfig: { maxOutputTokens: 1024, ...thinkingOff },
      });
      const content = data.candidates?.[0]?.content;
      const calls = (content?.parts || []).filter((p) => p.functionCall);
      if (!calls.length) {
        const reply = (content?.parts || []).map((p) => p.text || "").join("").trim();
        return Response.json({ reply: reply || "Sorry, could you please repeat that?", toolCalls, cancelled: [...cancelled] });
      }
      contents.push(content);
      const responses = calls.map(({ functionCall: fc }) => {
        const result = runTool(fc.name, fc.args, cancelled);
        toolCalls.push({ name: fc.name, args: fc.args, result });
        return { functionResponse: { id: fc.id, name: fc.name, response: result } };
      });
      contents.push({ role: "user", parts: responses });
    }
    return Response.json({ reply: "Sorry, I'm having trouble right now. Could you please try again?", toolCalls, cancelled: [...cancelled] });
  } catch (e) {
    console.error(e);
    return Response.json({ reply: "Sorry, I'm facing a technical issue. Please try again in a moment.", error: true, detail: String(e.message).slice(0, 700) });
  }
}
