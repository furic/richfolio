import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see web/.env.example).",
  );
}

// The anon key is public by design (RLS decides access); never put the service-role key in web/.
export const supabase = createClient<Database>(url, anonKey, {
  auth: { flowType: "pkce" },
});
