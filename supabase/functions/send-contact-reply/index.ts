import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { composeContactReplyEmail } from "./email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("CONTACT_REPLY_FROM");
  const sitePublicUrl = Deno.env.get("SITE_PUBLIC_URL");
  const authorization = request.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "SUPABASE_FUNCTION_NOT_CONFIGURED" });
  if (!authorization.startsWith("Bearer ")) return json(401, { error: "AUTHENTICATION_REQUIRED" });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "INVALID_SESSION" });

  let body: { replyId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }
  if (typeof body.replyId !== "string" || !uuidPattern.test(body.replyId)) {
    return json(400, { error: "VALID_REPLY_ID_REQUIRED" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: assignment }, { data: profile }] = await Promise.all([
    admin.from("executive_assignments").select("position_key").eq("user_id", authData.user.id).in("position_key", ["PRESIDENT", "VICE_PRESIDENT"]).maybeSingle(),
    admin.from("profiles").select("status").eq("id", authData.user.id).maybeSingle(),
  ]);
  if (!assignment || !["PRESIDENT", "VICE_PRESIDENT"].includes(assignment.position_key) || profile?.status !== "active") {
    return json(403, { error: "CONTACT_ADMIN_REQUIRED" });
  }

  const { data: reply, error: replyError } = await admin
    .from("contact_message_replies")
    .select("id,message_id,reply_text,replied_by_name,delivery_channel,delivery_status,delivery_attempts,contact_messages!contact_message_replies_message_id_fkey(sender_name,sender_email,subject,sender_user_id)")
    .eq("id", body.replyId)
    .maybeSingle();
  if (replyError || !reply) return json(404, { error: "CONTACT_REPLY_NOT_FOUND" });
  if (reply.delivery_channel !== "EMAIL") return json(409, { error: "IN_APP_REPLY_HAS_NO_EMAIL_DELIVERY" });
  if (reply.delivery_status === "SENT") return json(200, { ok: true, deliveryStatus: "SENT", alreadySent: true });

  const related = Array.isArray(reply.contact_messages) ? reply.contact_messages[0] : reply.contact_messages;
  const attempts = Number(reply.delivery_attempts ?? 0) + 1;
  const markFailed = async (reason: string) => {
    await admin.from("contact_message_replies").update({
      delivery_status: "FAILED",
      delivery_attempts: attempts,
      delivery_last_error: reason.slice(0, 800),
    }).eq("id", reply.id).neq("delivery_status", "SENT");
  };

  if (!related || related.sender_user_id !== null || !related.sender_email || !resendApiKey || !fromEmail || !sitePublicUrl) {
    await markFailed("EMAIL_DELIVERY_CONFIGURATION_OR_RECIPIENT_INVALID");
    return json(500, { error: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  }

  const email = composeContactReplyEmail({
    senderName: String(related.sender_name),
    subject: String(related.subject),
    replyText: String(reply.reply_text),
    repliedByName: String(reply.replied_by_name),
    sitePublicUrl,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `contact-reply/${reply.id}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [related.sender_email],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  const providerBody = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    await markFailed(`RESEND_${response.status}:${String(providerBody.message ?? "DELIVERY_FAILED")}`);
    return json(502, { error: "RESEND_DELIVERY_FAILED" });
  }

  const providerId = typeof providerBody.id === "string" ? providerBody.id : null;
  const { error: updateError } = await admin.from("contact_message_replies").update({
    delivery_status: "SENT",
    delivery_attempts: attempts,
    delivery_last_error: null,
    email_provider_id: providerId,
    sent_at: new Date().toISOString(),
  }).eq("id", reply.id).neq("delivery_status", "SENT");
  if (updateError) return json(500, { error: "DELIVERY_AUDIT_UPDATE_FAILED" });
  return json(200, { ok: true, deliveryStatus: "SENT" });
});
