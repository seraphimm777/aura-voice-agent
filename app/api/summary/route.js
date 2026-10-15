import { gemini } from "@/lib/gemini";

const FALLBACK = { customer_intent: "OTHER", order_id: null, resolution_status: "UNRESOLVED", call_summary: "Summary unavailable." };

export async function POST(req) {
  const { transcript } = await req.json();
  if (!transcript?.length) return Response.json({ ...FALLBACK, call_summary: "No conversation took place." });
  const text = transcript.map((m) => `${m.role === "user" ? "Customer" : "Aria"}: ${m.text}`).join("\n");
  try {
    const data = await gemini({
      contents: [{ role: "user", parts: [{ text: `Summarise this customer support call.\n\n${text}` }] }],
      generationConfig: {
        responseMimeType: "application/json", temperature: 0,
        responseSchema: { type: "OBJECT", properties: {
          customer_intent: { type: "STRING", enum: ["ORDER_TRACKING", "CANCELLATION", "RETURN_REFUND", "PRODUCT_INFO", "SHIPPING_INFO", "PAYMENT_COD", "OUT_OF_SCOPE", "OTHER"] },
          order_id: { type: "STRING", nullable: true },
          resolution_status: { type: "STRING", enum: ["RESOLVED", "UNRESOLVED", "ESCALATION_NEEDED"] },
          call_summary: { type: "STRING" } },
          required: ["customer_intent", "order_id", "resolution_status", "call_summary"] },
        thinkingConfig: { thinkingLevel: "low" },
      },
    });
    return Response.json(JSON.parse(data.candidates[0].content.parts[0].text));
  } catch (e) {
    console.error(e);
    return Response.json(FALLBACK);
  }
}
