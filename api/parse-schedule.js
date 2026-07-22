// Vercel serverless function: reads a photo of the camp schedule with Claude
// vision and returns it as the app's schedule JSON.
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
        "Photo reading isn't set up yet. In Vercel, add an environment variable named ANTHROPIC_API_KEY, then redeploy.",
    });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body || "{}");
    const image = body && body.image;
    const groups = (body && body.groups) || [];

    if (!image) {
      res.status(400).json({ error: "No image was received." });
      return;
    }
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(image);
    if (!m) {
      res.status(400).json({ error: "Image must be a base64 data URL." });
      return;
    }
    const mediaType = m[1];
    const data = m[2];
    const model = process.env.PARSE_MODEL || "claude-sonnet-4-6";

    const knownGroups =
      Array.isArray(groups) && groups.length
        ? `The camp groups (the columns), left to right, are most likely: ${groups.join(
            ", "
          )}. Reuse these exact names and this order if they match the photo.`
        : "";

    const instructions = `You are reading a photo of a summer camp's DAILY SCHEDULE and converting it to JSON.

The schedule is a grid:
- ROWS are time slots (e.g. "2:00-3:00", "Carnival", "Lunch").
- COLUMNS are camp groups/divisions. A group may be split into two sub-columns, each doing a different activity in the same slot.
- Each CELL contains the workshop or activity that group is doing (e.g. "Woodworking", "Glass Fusion", "Laser Engraving", "CLUE", "Carnival", "Dodgeball", "Sports: Soccer").

${knownGroups}

Return ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{
  "dayName": "string - the date/day printed on the schedule, or '' if none",
  "groups": ["Group 1 name", "Group 2 name", ...],
  "slots": [
    {
      "time": "e.g. 2:00-3:00",
      "label": "short name for the row if any, e.g. 'Period 1', else ''",
      "entries": [ { "g": 0, "a": "activity text" }, { "g": 1, "a": "activity text" } ]
    }
  ]
}

Rules:
- "groups" lists the column headers left to right. Each entry's "g" is the 0-based index into "groups".
- Put an entry for EVERY activity written in a cell. If a group's cell has two sub-activities, add two entries with the same "g".
- If one activity clearly spans the whole row (all columns), add one entry for each group index it visually covers.
- Copy the activity text as written on the schedule (keep names like "Wood Working", "Pottery Glazing", "Ductagami"). Do not invent or normalize.
- Skip empty cells. Include special/whole-camp rows (Carnival, CLUE, Dodgeball, Lunch) as their own slots.
- Focus on the activity/workshop grid. You may skip pure logistics lines (Shachris, Mincha, Dinner) unless they occupy the grid.`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: instructions },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({
        error: "The AI service returned an error (" + r.status + ").",
        detail: t.slice(0, 400),
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
      res.status(502).json({
        error: "Couldn't read a schedule out of that photo. Try a clearer, straight-on picture.",
        raw: text.slice(0, 400),
      });
      return;
    }

    const parsed = JSON.parse(jsonStr);
    if (!parsed || !Array.isArray(parsed.slots)) {
      res.status(502).json({ error: "The photo didn't produce a valid schedule." });
      return;
    }
    if (!Array.isArray(parsed.groups)) parsed.groups = groups;

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Failed to read the photo: " + (e.message || String(e)) });
  }
}

function extractJson(text) {
  if (!text) return null;
  let t = text.trim();
  // strip ```json ... ``` fences if present
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
