export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    const modelName = "gemini-3.8-flash";

    if (url.pathname === "/test-ia") {
      try {
        const key = (env.GEMINI_API_KEY || "").trim();
        if (!key) {
          return new Response(JSON.stringify({ ok: false, step: "env", error: "GEMINI_API_KEY vide ou absente" }), {
            status: 200,
            headers: { ...cors, "Content-Type": "application/json" }
          });
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Réponds uniquement par le mot OK." }] }]
          })
        });

        const textBody = await res.text();
        return new Response(JSON.stringify({
          ok: res.ok,
          status: res.status,
          model: modelName,
          geminiResponse: textBody.slice(0, 600)
        }), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, step: "catch", error: String(e) }), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/analyze" && request.method === "POST") {
      try {
        const key = (env.GEMINI_API_KEY || "").trim();
        if (!key) {
          return new Response(JSON.stringify({ error: "GEMINI_API_KEY manquante sur le Worker" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" }
          });
        }

        const body = await request.json();
        const { imageBase64, mimeType, queryText, category } = body || {};

        const cleanBase64 = imageBase64
          ? imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
          : null;

        const prompt = `Tu es un expert en consommation domestique et calcul de coût réel (TCO) pour un particulier à domicile.
Analyse la demande (photo et/ou texte d'article).
Règles :
1. Estime le prix moyen neuf grand public en euros (initA) pour un usage à domicile (pas de matériel industriel ou professionnel sauf si explicitement demandé).
2. Si un prix est visible sur la photo ou déjà connu, priorise-le pour initA.
3. Estime un coût moyen par utilisation réaliste à domicile (unitA : consommables, électricité, recharge, produit d'entretien, etc.), les frais fixes annuels (annualA) et la valeur de revente estimée en fin de période (resaleA).
4. Propose une alternative pertinente pour un foyer (Option B : plus durable, plus économique à l'usage, ou à meilleur rapport coût/durée) avec ses propres estimations (initB, unitB, annualB, resaleB).
5. Adapte usesPerWeek et years (entre 1 et 10) à l'usage réel d'un particulier à la maison.

Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans texte autour) :
{
  "titre": "Nom court du comparatif",
  "nomA": "Article identifié",
  "initA": 79.99,
  "unitA": 0.45,
  "annualA": 15,
  "resaleA": 0,
  "nomB": "Alternative domestique",
  "initB": 220,
  "unitB": 0.14,
  "annualB": 25,
  "resaleB": 35,
  "usesPerWeek": 14,
  "years": 5
}`;

        const parts = [{ text: prompt }];
        if (queryText || category) {
          parts.push({ text: `Article : "${queryText || "non précisé"}" | Catégorie : "${category || "generic"}"` });
        }
        if (cleanBase64) {
          parts.push({
            inline_data: {
              mime_type: mimeType || "image/jpeg",
              data: cleanBase64
            }
          });
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
        const apiRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { response_mime_type: "application/json" }
          })
        });

        const raw = await apiRes.text();
        if (!apiRes.ok) {
          return new Response(JSON.stringify({ error: `Gemini ${apiRes.status}: ${raw.slice(0, 300)}` }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" }
          });
        }

        const parsed = JSON.parse(raw);
        const contentText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleanedJson = contentText.replace(/```json|```/g, "").trim();

        return new Response(cleanedJson, {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: `Worker catch: ${e.message || String(e)}` }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Worker simu-vie actif", { status: 200, headers: cors });
  }
};
