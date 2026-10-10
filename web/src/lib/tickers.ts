import { supabase } from "../supabase";
import {
  unverifiedInfo,
  type LookupKind,
  type LookupResult,
} from "../../../supabase/functions/ticker-lookup/lookup";

export async function lookupTicker(symbol: string, kind: LookupKind): Promise<LookupResult> {
  const { data, error } = await supabase.functions.invoke<LookupResult>("ticker-lookup", {
    body: { symbol, kind },
  });
  // Function unreachable gets the upstream-failure policy: save unverified, don't block.
  if (error || !data) {
    console.error("ticker-lookup failed", error);
    return { ok: true, info: unverifiedInfo(symbol, kind) };
  }
  return data;
}
