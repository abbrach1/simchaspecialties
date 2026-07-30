// Vercel serverless function: asks Claude to match schedule activity names to
// the workshops on the roster. It is told to return a question instead of a
// guess when a name is genuinely ambiguous, so uncertain cases go to the user.
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
        "AI matching isn't set up yet. In Vercel, add an environment variable named ANTHROPIC_API_KEY, then redeploy.",
    });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const activities = (body && body.activities) || [];
    const workshops = (body && body.workshops) || [];

    if (!Array.isArray(activities) || !activities.length) {
      res.status(400).json({ error: "No activities to match." });
      return;
    }
    const model = process.env.PARSE_MODEL || "claude-sonnet-4-6";

    const workshopList = workshops
      .map((w) =>
        typeof w === "string"
          ? "- " + w
          : "- " + w.name + (w.staff ? " (" + w.staff + " staff)" : " (no staff assigned)")
      )
      .join("\n");

    const prompt = `A summer camp's daily schedule lists activity names that must be matched to the camp's official workshop list. Spellings differ, words get shortened, and locations or notes get mixed in.

OFFICIAL WORKSHOPS:
${workshopList}

ACTIVITY NAMES FROM THE SCHEDULE THAT NEED MATCHING:
${activities.map((a, i) => i + 1 + ". " + a).join("\n")}

For each activity name, decide which official workshop it refers to.

Return ONLY a JSON object, no prose and no markdown fences:
{
  "matches": [
    {
      "activity": "the activity name exactly as given above",
      "workshop": "the official workshop name, or null if none fits",
      "confidence": 0.0,
      "question": ""
    }
  ]
}

Rules:
- "workshop" MUST be copied exactly from the official list above, or be null.
- "confidence" is 0.0-1.0 for how sure you are. Use 0.9+ ONLY when it is clearly the same activity (a spelling variant, abbreviation, or the same name with a location or note attached).
- If the name is ambiguous, could fit two workshops, or looks like a whole-camp event rather than a workshop (for example a carnival, a trip, a game, a meal), set a LOWER confidence and write a short "question" asking the user what they want. It is better to ask than to guess wrong.
- Put a "question" ONLY when you genuinely need the user to decide. Keep it to one sentence.
- If the activity is clearly not a workshop and needs staff pulled to cover it, use workshop null, confidence 0, and a question that says so.
- Include an entry for every activity name listed.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
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
    const text = (j.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    const jsonStr = extractJson(text);
    if (!jsonStr) {
      res.status(502).json({ error: "The AI didn't return a usable answer. Try again." });
      return;
    }
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !Array.isArray(parsed.matches)) {
      res.status(502).json({ error: "The AI didn't return a usable answer. Try again." });
      return;
    }

    // never let a hallucinated workshop name through
    const valid = new Set(
      workshops.map((w) => (typeof w === "string" ? w : w.name))
    );
    parsed.matches = parsed.matches.map((m) => ({
      activity: m && m.activity,
      workshop: m && m.workshop && valid.has(m.workshop) ? m.workshop : null,
      confidence: m && typeof m.confidence === "number" ? m.confidence : 0,
      question: (m && m.question) || "",
    }));

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Matching failed: " + (e.message || String(e)) });
  }
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  try {
    JSON.parse(t);
    return t;
  } catch (e) {}
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = t.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch (e) {}
  }
  return null;
}
