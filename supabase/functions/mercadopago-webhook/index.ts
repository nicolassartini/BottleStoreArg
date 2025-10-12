import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    console.log("Webhook received:", body);

    if (body.type === "payment") {
      const paymentId = body.data.id;
      const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

      const paymentResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const payment = await paymentResponse.json();
      console.log("Payment data:", payment);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      if (payment.status === "approved") {
        await supabase
          .from("orders")
          .update({
            status: "confirmed",
            payment_id: paymentId.toString(),
            payment_status: "paid",
          })
          .eq("id", payment.external_reference);
      } else if (payment.status === "rejected") {
        await supabase
          .from("orders")
          .update({
            status: "cancelled",
            payment_status: "failed",
          })
          .eq("id", payment.external_reference);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});