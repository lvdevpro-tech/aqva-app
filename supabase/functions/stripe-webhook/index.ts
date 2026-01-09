/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseStripeSignature(header: string) {
  const parts = header.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2) ?? null;
  const v1s = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return { t, v1s };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!supabaseUrl || !serviceKey || !webhookSecret) {
      return json(500, { error: "Missing SUPABASE_URL / SERVICE_ROLE_KEY / STRIPE_WEBHOOK_SECRET" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const sigHeader = req.headers.get("stripe-signature") ?? "";
    const rawBody = await req.text();

    const { t, v1s } = parseStripeSignature(sigHeader);
    if (!t || v1s.length === 0) return json(400, { error: "missing signature" });

    // Tolérance timestamp (5 minutes)
    const ts = Number(t);
    if (!Number.isFinite(ts)) return json(400, { error: "invalid timestamp" });
    const nowSec = Math.floor(Date.now() / 1000);
    const toleranceSec = 300;
    if (Math.abs(nowSec - ts) > toleranceSec) {
      return json(401, { error: "timestamp outside tolerance" });
    }

    // Vérifier signature : Stripe peut envoyer plusieurs v1
    const signedPayload = `${t}.${rawBody}`;
    const expectedHex = await hmacSha256Hex(webhookSecret, signedPayload);

    const expectedBytes = new TextEncoder().encode(expectedHex);
    const ok = v1s.some((v1) => timingSafeEqualBytes(expectedBytes, new TextEncoder().encode(v1)));
    if (!ok) return json(401, { error: "invalid signature" });

    const event = JSON.parse(rawBody);

    const session = event?.data?.object;
    const sessionId = session?.id as string | undefined;

    const orderId =
      (session?.metadata?.order_id as string | undefined) ??
      (session?.client_reference_id as string | undefined);

    if (!orderId || !sessionId) {
      return json(200, { ok: true, note: "no orderId/sessionId (ignored)" });
    }

    const nowIso = new Date().toISOString();

    // 1) Paiement OK
    if (event.type === "checkout.session.completed") {
      // Orders
      await supabase
        .from("orders")
        .update({ payment_status: "paid", payment_method: "card", updated_at: nowIso })
        .eq("id", orderId);

      // Payments: upsert (au cas où la ligne n’existe pas / webhook retry)
      // NOTE: tu n'as pas de contrainte unique. On fait update d'abord, puis insert si 0 lignes.
      const { data: updatedRows, error: updErr } = await supabase
        .from("payments")
        .update({ status: "paid", updated_at: nowIso })
        .eq("order_id", orderId)
        .eq("provider", "stripe")
        .eq("provider_payment_id", sessionId)
        .select("id");

      if (updErr) console.error("payments update error:", updErr);

      if (!updatedRows || updatedRows.length === 0) {
        await supabase.from("payments").insert({
          order_id: orderId,
          provider: "stripe",
          provider_payment_id: sessionId,
          amount_cents: Number(session?.amount_total ?? 0),
          currency: String((session?.currency ?? "ZAR")).toUpperCase(),
          status: "paid",
          created_at: nowIso,
          updated_at: nowIso,
        });
      }

      return json(200, { ok: true });
    }

    // 2) Checkout expiré
    if (event.type === "checkout.session.expired") {
      await supabase
        .from("payments")
        .update({ status: "failed", updated_at: nowIso })
        .eq("order_id", orderId)
        .eq("provider", "stripe")
        .eq("provider_payment_id", sessionId);

      await supabase
        .from("orders")
        .update({ payment_status: "unpaid", updated_at: nowIso })
        .eq("id", orderId);

      return json(200, { ok: true });
    }

    return json(200, { ok: true, ignored: event.type });
  } catch (e) {
    return json(500, { error: String((e as any)?.message ?? e) });
  }
});
