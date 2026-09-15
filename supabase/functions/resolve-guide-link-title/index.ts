import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { resolveGuideLinkWithAdapter } from "./guideLinkMetadata.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
});

async function lookupAddresses(hostname: string, signal: AbortSignal | undefined): Promise<string[]> {
  const results = await Promise.allSettled([
    Deno.resolveDns(hostname, "A", { signal, nameServer: { ipAddr: "8.8.8.8", port: 53 } }),
    Deno.resolveDns(hostname, "AAAA", { signal, nameServer: { ipAddr: "8.8.8.8", port: 53 } }),
  ]);
  const addresses: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      for (const record of result.value) {
        const value = String(record).trim();
        if (value) addresses.push(value);
      }
    }
  }
  return addresses;
}

async function fetchOnce(url: string, signal: AbortSignal | undefined): Promise<{
  status: number;
  location: string | null;
  body: string;
}> {
  const response = await fetch(url, {
    redirect: "manual",
    signal,
    headers: {
      "User-Agent": "UmmetGencleriGuideMetadata/1.0 (+https://local-development)",
      Accept: "text/html, application/xhtml+xml",
    },
  });
  const location = response.headers.get("location");
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    return { status: response.status, location, body: "" };
  }
  const body = await response.text();
  return { status: response.status, location, body };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "INVALID_JSON" });
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return json(400, { error: "VALID_URL_REQUIRED" });
  }

  const manager = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: assignment }, { data: profile }] = await Promise.all([
    manager.from("executive_assignments").select("position_key").eq("user_id", authData.user.id).in("position_key", ["PRESIDENT", "MEDIA_HEAD"]).maybeSingle(),
    manager.from("profiles").select("status").eq("id", authData.user.id).maybeSingle(),
  ]);
  const isGuideEditor =
    assignment !== null &&
    ["PRESIDENT", "MEDIA_HEAD"].includes(String(assignment.position_key)) &&
    profile?.status === "active";
  if (!isGuideEditor) return json(403, { error: "GUIDE_EDITOR_REQUIRED" });

  const adapter = {
    makeTimeoutSignal: (timeoutMs: number) => AbortSignal.timeout(timeoutMs),
    lookupAddresses,
    fetchOnce,
  };

  const result = await resolveGuideLinkWithAdapter(body.url, adapter, {
    maxBytes: 64 * 1024,
    maxRedirects: 5,
    timeoutMs: 5000,
  });

  if (result.blocked) return json(200, { ok: false, title: null, host: result.host, finalUrl: "", blocked: true });
  if (!result.ok) return json(200, { ok: false, title: null, host: result.host, finalUrl: "", blocked: false });

  return json(200, {
    ok: true,
    title: result.title,
    host: result.host,
    finalUrl: result.finalUrl,
    blocked: false,
  });
});