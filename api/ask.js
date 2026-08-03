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
    const image = (body && body.image) || null;

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

    // attach the photo of the printed schedule to the newest question, so the
    // model can read anything the briefing doesn't carry
    let hasImage = false;
    if (image) {
      const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(image);
      if (m) {
        hasImage = true;
        const last = messages[messages.length - 1];
        last.content = [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: last.content },
        ];
      }
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
- The briefing also carries attendance marks, the user's own round notes, their speak-to list, and the rooming list. Use them when asked.
- When the user needs people to cover something, call the propose_coverage tool. It works for anything, including an activity that appears nowhere in the app — take the user's wording for it. Choose only names from that period's FREE list. If they don't say how many people, propose a sensible small number and say why. The user confirms before anything is saved, so make the proposal concrete rather than asking which names they want.
${hasImage ? `- A photo of the printed schedule sheet is attached to the question. The briefing stays authoritative for who is free or busy, but the photo is the place to look for anything the briefing lacks: davening, meal and bedtime times, locations, group names, footnotes, and anything handwritten. If the photo and the briefing disagree about an activity, say so — it usually means the schedule was typed in wrong.` : `- No photo of the schedule was provided. If asked about something only the printed sheet would show, say it isn't available and suggest uploading the photo on the Schedule tab.`}

BRIEFING:
${briefing}`;

    // Lets the user say "I need 3 people for the special activity at 2:15"
    // without that activity having to exist anywhere in the app. Nothing is
    // written by this call — the app asks the user to confirm first.
    const tools = [
      {
        name: "propose_coverage",
        description:
          "Propose specific staff to cover an activity in one period. Use this whenever the user asks for people to cover something, including an activity that is not on the schedule at all. Pick people ONLY from that period's FREE lists in the briefing. Prefer free specialty staff; use standing crew only if there are not enough, and say so.",
        input_schema: {
          type: "object",
          properties: {
            period: {
              type: "integer",
              description: "Period number exactly as numbered in the briefing (1 = first period of the day).",
            },
            activity: {
              type: "string",
              description:
                "What needs covering, e.g. 'Special Activity in the Front of Camp'. Copy the user's wording.",
            },
            people: {
              type: "array",
              items: { type: "string" },
              description: "Names copied exactly from that period's FREE list.",
            },
            note: { type: "string", description: "One short sentence on why these people." },
          },
          required: ["period", "activity", "people"],
        },
      },
    ];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: 1200, system, tools, messages }),
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
    const blocks = j.content || [];
    const reply = blocks
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();
    const proposals = blocks
      .filter((c) => c.type === "tool_use" && c.name === "propose_coverage" && c.input)
      .map((c) => ({
        period: c.input.period,
        activity: String(c.input.activity || "").slice(0, 120),
        people: Array.isArray(c.input.people) ? c.input.people.map(String) : [],
        note: String(c.input.note || "").slice(0, 300),
      }))
      .filter((p) => p.activity && Number.isFinite(p.period));

    res.status(200).json({
      reply: reply || (proposals.length ? "" : "(no answer)"),
      proposals,
    });
  } catch (e) {
    res.status(500).json({ error: "Question failed: " + (e.message || String(e)) });
  }
}
