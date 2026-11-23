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
        const body = await request.json();
        const { imageBase64, mimeType, queryText, category } = body;

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
        if (imageBase64) {
          parts.push({
            inline_data: {
              mime_type: mimeType || "image/jpeg",
              data: imageBase64
            }
          });
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

        const apiRes = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { response_mime_type: "application/json" }
          })
        });

        const data = await apiRes.json();
        if (!apiRes.ok) {
          return new Response(JSON.stringify({ error: data.error?.message || "Erreur Gemini" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
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
