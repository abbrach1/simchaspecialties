// Vercel serverless function: answers questions about the current day using a
// briefing the app builds itself.
//
// The briefing already contains the computed free/busy lists, so the model is
// told to quote them rather than work anything out — availability maths belongs
// in the app, not in a language model.
//
// Requires an environment variable in the Vercel project:
//   ANTHROPIC_API_KEY   (required)
//   PARSE_MODEL         (optional, defaults to claude-sonnet-4-6)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({
      error:
        "The assistant isn't set up yet. In Vercel, add an environment variable named ANTHROPIC_API_KEY, then redeploy.",
    });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const briefing = (body && body.briefing) || "";
    const incoming = (body && body.messages) || [];

    if (!briefing) {
      res.status(400).json({ error: "No schedule information was sent." });
      return;
    }

    // keep only well-formed turns, and cap history so the request stays small
    const messages = incoming
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim()
      )
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      res.status(400).json({ error: "No question was asked." });
      return;
    }

    const model = process.env.PARSE_MODEL || "claude-sonnet-4-6";

    const system = `You help the head of the Specialty Division at Camp Simcha. Your job is to answer questions about staff availability and today's schedule.

Below is a briefing generated from the app's own data. The free/busy lists in it are ALREADY CALCULATED and are authoritative.

RULES:
- Answer ONLY from the briefing. Never invent a name, workshop, or period.
- Do NOT recalculate who is free. Read the relevant "FREE" line and quote it. If a question spans several periods, use the per-period lists; for "the whole day" use the "FREE IN EVERY PERIOD" line.
- Periods are numbered by their position in the day. "First activity" = PERIOD 1, "second" = PERIOD 2, and so on. If someone asks for a period that does not exist, say so.
- A period also has the label printed on the schedule, and the two can disagree — if the day opens with a carnival, the slot labelled "Period 1" is PERIOD 2 by position. ALWAYS state the time range you used in your answer so the user can catch a mismatch. If a request is genuinely ambiguous between a position and a printed label, answer for the most likely one, say which you used, and offer the other.
- "Free specialty staff" are the ones to pull first. "Standing crew" are free of workshops but hold fixed duties (office, maintenance, canteen, night crew) — mention them separately and only if useful.
- Be brief and practical. Prefer short labelled lists over prose. Give counts alongside names. Plain text only, no markdown formatting or tables.
- If a question can't be answered from the briefing, say what's missing rather than guessing.
- If the briefing shows a WARNING about unmatched activity names, mention it when it affects the answer, because those staff are not counted as busy.

BRIEFING:
${briefing}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 1200, system, messages }),
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({
        error: "The AI service returned an error (" + r.status + ").",
        detail: t.slice(0, 300),
      });
      return;
    }

    const j = await r.json();
    const reply = (j.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();

    res.status(200).json({ reply: reply || "(no answer)" });
  } catch (e) {
    res.status(500).json({ error: "Question failed: " + (e.message || String(e)) });
  }
}
