// Tries fast models first and falls through to the next one on overload, timeout or model errors.
const MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.6-flash"];
const url = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${process.env.GEMINI_API_KEY}`;

async function call(model, body) {
  const r = await fetch(url(model), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return r;
}

export async function gemini(body) {
  let last;
  for (const model of MODELS) {
    const t = Date.now();
    try {
      let r = await call(model, body);
      if (r.status === 400 && body.generationConfig?.thinkingConfig) {
        // some models reject the thinking setting: retry once without it
        const { thinkingConfig, ...gc } = body.generationConfig;
        r = await call(model, { ...body, generationConfig: gc });
      }
      console.log(`[gemini] ${model} ${r.status} in ${Date.now() - t}ms`);
      if (r.ok) return await r.json();
      const text = (await r.text()).slice(0, 300);
      last = new Error(`Gemini ${model} ${r.status}: ${text}`);
      if (r.status === 401 || r.status === 403) throw last; // key problem: stop here
    } catch (e) {
      if (e === last) throw e;
      console.log(`[gemini] ${model} failed in ${Date.now() - t}ms: ${e.message}`);
      last = e;
    }
  }
  throw last;
}
export const thinkingOff = { thinkingConfig: { thinkingLevel: "low" } };
