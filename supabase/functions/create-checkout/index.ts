/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const successUrl = Deno.env.get("CHECKOUT_SUCCESS_URL");
    const cancelUrl = Deno.env.get("CHECKOUT_CANCEL_URL");

    if (!stripeKey) return json(500, { error: "Missing STRIPE_SECRET_KEY" });
    if (!successUrl) return json(500, { error: "Missing CHECKOUT_SUCCESS_URL" });
    if (!cancelUrl) return json(500, { error: "Missing CHECKOUT_CANCEL_URL" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json(500, { error: "Missing SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY" });
    }

    // 1) Lire payload
    const payload = await req.json().catch(() => null);
    const order_id = payload?.order_id as string | undefined;
    if (!order_id) return json(400, { error: "order_id missing" });

    // 2) Vérifier utilisateur (JWT client)
    const authHeader = req.headers.get("authorization") ?? "";
    const sbUserClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await sbUserClient.auth.getUser();
    if (authErr || !authData?.user?.id) return json(401, { error: "Unauthorized" });

    // 3) Service role pour lire/écrire DB
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id,user_id,status,total_cents,payment_status")
      .eq("id", order_id)
      .maybeSingle();

    if (orderErr) return json(500, { error: "order select failed", details: orderErr.message });
    if (!order) return json(404, { error: "order not found", order_id });

    // Sécurité: le user connecté doit être le propriétaire de la commande
    if (order.user_id !== authData.user.id) return json(403, { error: "Forbidden (not your order)" });

    // Pas payable si déjà payé ou annulé/livré
    if (order.payment_status === "paid") return json(409, { error: "order already paid" });
    if (["cancelled", "delivered", "failed"].includes(order.status)) {
      return json(409, { error: `order not payable in status=${order.status}` });
    }

    const amount = Number(order.total_cents ?? 0);
    if (!Number.isFinite(amount) || amount < 100) return json(400, { error: "amount too low (>= 100 cents)" });

    // Tag “card intent” côté order
    await supabase
      .from("orders")
      .update({ payment_method: "card", updated_at: new Date().toISOString() })
      .eq("id", order.id);

    // Créer session Stripe Checkout
    const body = formEncode({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: order.id,

      "payment_method_types[0]": "card",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "zar",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": "AQVA Water Delivery",

      "metadata[order_id]": order.id,
      "metadata[user_id]": order.user_id ?? "",
    });

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const session = await resp.json();
    if (!resp.ok) return json(502, { error: "stripe session create failed", stripe: session });

    // Enregistrer payment (session.id stockée dans provider_payment_id)
    const nowIso = new Date().toISOString();
    await supabase.from("payments").insert({
      order_id: order.id,
      provider: "stripe",
      provider_payment_id: session.id,
      amount_cents: amount,
      currency: "ZAR",
      status: "pending",
      created_at: nowIso,
      updated_at: nowIso,
    });

    return json(200, { url: session.url, session_id: session.id });
  } catch (e) {
    return json(500, { error: String((e as any)?.message ?? e) });
  }
});
