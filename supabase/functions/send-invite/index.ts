import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import { inviteErrorResponse, normaliseEmail } from "./logic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  // Ask as the caller: is_admin() reads the caller's own profile via their JWT.
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await asCaller.auth.getUser();
  const { data: isAdmin } = await asCaller.rpc("is_admin");
  if (!userData.user || isAdmin !== true) return json({ error: "Admins only." }, 403);

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = normaliseEmail(body.email);
  if (!email) return json({ error: "Enter a valid email address." }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // The invite row must exist BEFORE inviteUserByEmail: creating the auth user
  // runs the before_user_created hook, which rejects emails not in invites.
  const { error: rowError } = await admin
    .from("invites")
    .upsert({ email, invited_by: userData.user.id }, { onConflict: "email" });
  if (rowError) return json({ error: rowError.message }, 500);

  const { error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) {
    const r = inviteErrorResponse(error.message);
    return json({ error: r.message }, r.status);
  }
  return json({ ok: true });
});
