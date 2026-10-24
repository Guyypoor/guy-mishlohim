// גיא שליחויות – מסלול עם תנועה בזמן אמת דרך TomTom (24/10/2026)
// המפתח נשמר כסוד TOMTOM_KEY ולא נחשף לטלפונים. רק שליח פעיל / מנהל מחובר יכול לקרוא לפונקציה.
// עותק של מה שנפרס ב-Supabase (Edge Functions → tomtom-route). Verify JWT: כבוי – הבדיקה כאן בקוד.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("TOMTOM_KEY");
  if (!key) return json({ error: "no_key" }, 503);

  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ error: "auth" }, 401);
  const { data: prof } = await sb.from("profiles").select("status").eq("id", u.user.id).maybeSingle();
  if (!prof || prof.status !== "active") return json({ error: "inactive" }, 403);

  let body: { points?: { lat: number; lon: number }[]; best?: boolean; depart?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const pts = body.points;
  if (!Array.isArray(pts) || pts.length < 2 || pts.length > 150) return json({ error: "bad_points" }, 400);
  for (const p of pts) if (!isFinite(+p.lat) || !isFinite(+p.lon)) return json({ error: "bad_points" }, 400);

  const locs = pts.map((p) => (+p.lat).toFixed(6) + "," + (+p.lon).toFixed(6)).join(":");
  const q = new URLSearchParams({ key, traffic: "true", travelMode: "car", routeType: "fastest", routeRepresentation: "summaryOnly" });
  if (body.best && pts.length >= 4) q.set("computeBestOrder", "true");
  if (body.depart && Date.parse(body.depart) > Date.now() + 60000) q.set("departAt", body.depart);

  const r = await fetch("https://api.tomtom.com/routing/1/calculateRoute/" + locs + "/json?" + q.toString());
  let j: any = null;
  try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok || !j?.routes?.[0]) {
    return json({ error: "tomtom", status: r.status, detail: j?.detailedError?.message || j?.error?.description || "" }, 502);
  }
  const route = j.routes[0];
  return json({
    legs: route.legs.map((l: any) => ({ t: l.summary.travelTimeInSeconds, d: l.summary.lengthInMeters, delay: l.summary.trafficDelayInSeconds || 0 })),
    order: Array.isArray(j.optimizedWaypoints) ? j.optimizedWaypoints : null,
    total: { t: route.summary.travelTimeInSeconds, d: route.summary.lengthInMeters, delay: route.summary.trafficDelayInSeconds || 0 },
  });
});
