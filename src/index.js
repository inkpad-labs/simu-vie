export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/analyze" && request.method === "POST") {
      try {
        if (!env.GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ error: "Variable GEMINI_API_KEY absente sur le Worker" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
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
          parts.push({
            text: `Article recherché : "${queryText || "non précisé"}" | Catégorie indiquée : "${category || "generic"}"`
          });
        }
        if (cleanBase64) {
          parts.push({
            inline_data: {
              mime_type: mimeType || "image/jpeg",
              data: cleanBase64
            }
          });
        }

        const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
        const keyValue = env.GEMINI_API_KEY.trim();

        const headers = {
          "Content-Type": "application/json",
          "x-goog-api-key": keyValue
        };

        let apiRes = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { response_mime_type: "application/json" }
          })
        });

        let data = await apiRes.json().catch(() => ({}));

        // Si x-goog-api-key renvoie 401/403 avec un jeton AQ..., tente aussi en Bearer
        if (!apiRes.ok && (apiRes.status === 401 || apiRes.status === 403) && keyValue.startsWith("AQ.")) {
          apiRes = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${keyValue}`
            },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { response_mime_type: "application/json" }
            })
          });
          data = await apiRes.json().catch(() => ({}));
        }

        if (!apiRes.ok) {
          return new Response(
            JSON.stringify({
              error: `Gemini HTTP ${apiRes.status}: ${data?.error?.message || "Erreur inconnue"}`
            }),
            {
              status: apiRes.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }

        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        return new Response(rawText.replace(/```json|```/g, "").trim(), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
