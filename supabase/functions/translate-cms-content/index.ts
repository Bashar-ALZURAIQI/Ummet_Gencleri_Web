import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization") ?? "";

  if (!authorization.startsWith("Bearer ")) {
    return json(401, { error: "AUTHENTICATION_REQUIRED" });
  }

  // Authenticate user session if Supabase Auth is configured
  if (supabaseUrl && anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice("Bearer ".length).trim();
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return json(401, { error: "INVALID_SESSION" });
    }
  }

  // Parse and validate request body
  let body: {
    sourceLocale?: unknown;
    targetLocale?: unknown;
    fields?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return json(400, { error: "INVALID_REQUEST: invalid json body" });
  }

  if (body.sourceLocale !== "ar") {
    return json(400, { error: "INVALID_REQUEST: sourceLocale must be ar" });
  }

  if (body.targetLocale !== "tr" && body.targetLocale !== "en") {
    return json(400, { error: "INVALID_REQUEST: targetLocale must be tr or en" });
  }

  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) {
    return json(400, { error: "INVALID_REQUEST: fields must be an object" });
  }

  const fields = body.fields as Record<string, unknown>;
  const keys = Object.keys(fields);

  // Reasonable request boundaries
  if (keys.length > 200) {
    return json(400, { error: "INVALID_REQUEST: fields count exceeds limit of 200" });
  }

  let totalChars = 0;
  for (const key of keys) {
    if (typeof fields[key] !== "string") {
      return json(400, { error: `INVALID_REQUEST: field "${key}" must be a string` });
    }
    totalChars += (fields[key] as string).length;
  }

  if (totalChars > 50000) {
    return json(400, { error: "INVALID_REQUEST: total characters exceed limit of 50000" });
  }

  // If no fields to translate, return early
  if (keys.length === 0) {
    return json(200, {
      targetLocale: body.targetLocale,
      translations: {},
    });
  }

  // Read Azure credentials strictly from server-side environment
  const azureKey = Deno.env.get("AZURE_TRANSLATOR_KEY");
  const azureRegion = Deno.env.get("AZURE_TRANSLATOR_REGION");
  const azureEndpoint =
    Deno.env.get("AZURE_TRANSLATOR_ENDPOINT") ||
    "https://api.cognitive.microsofttranslator.com";

  if (!azureKey) {
    return json(500, { error: "TRANSLATOR_NOT_CONFIGURED" });
  }

  try {
    const url = new URL("/translate", azureEndpoint);
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("from", "ar");
    url.searchParams.set("to", body.targetLocale as string);

    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=UTF-8",
      "Ocp-Apim-Subscription-Key": azureKey,
    };

    if (azureRegion) {
      headers["Ocp-Apim-Subscription-Region"] = azureRegion;
    }

    const payload = keys.map((key) => ({
      Text: fields[key] as string,
    }));

    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Safe error without exposing keys or raw response details
      return json(502, { error: "TRANSLATION_PROVIDER_ERROR" });
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return json(502, { error: "TRANSLATION_FAILED: malformed provider response" });
    }

    const translations: Record<string, string> = {};
    for (let i = 0; i < keys.length; i++) {
      const item = data[i];
      const translatedText = item?.translations?.[0]?.text;
      translations[keys[i]] = typeof translatedText === "string" ? translatedText : (fields[keys[i]] as string);
    }

    return json(200, {
      targetLocale: body.targetLocale,
      translations,
    });
  } catch {
    return json(500, { error: "TRANSLATION_FAILED" });
  }
});
