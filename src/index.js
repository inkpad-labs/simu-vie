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
        const { imageBase64, mimeType } = await request.json();

        const prompt = `Tu es un assistant d'achat expert en coût réel sur la durée (TCO).
Analyse cette photo d'article et/ou d'étiquette de prix en magasin.
Identifie l'article (Option A) et son prix affiché, puis propose une alternative pertinente (Option B) à coût d'usage plus réduit ou plus durable.
Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans texte autour) :
{
  "titre": "Nom court du duel",
  "nomA": "Article vu sur la photo",
  "initA": 79.99,
  "unitA": 0.45,
  "annualA": 15,
  "resaleA": 0,
  "nomB": "Alternative proposée",
  "initB": 350,
  "unitB": 0.14,
  "annualB": 30,
  "resaleB": 40,
  "usesPerWeek": 14,
  "years": 5
}`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

        const apiRes = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType || "image/jpeg", data: imageBase64 } }
              ]
            }],
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
 
