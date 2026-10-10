import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Database, Json } from "../../supabase/types";

type Tables = Database["public"]["Tables"];
export type Profile = Tables["profiles"]["Row"];
export type ProfilePatch = Pick<
  Tables["profiles"]["Update"],
  "display_name" | "default_currency" | "time_zone" | "planned_portfolio_value" | "settings"
>;

export class DbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function unwrap<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) {
    console.error("Supabase error", res.error.code, res.error.message);
    throw new DbError(res.error.message, res.error.code);
  }
  return res.data;
}

/** Typed settings objects are interfaces, which TS won't widen to Json on its own. */
export function toJson(value: object): NonNullable<Json> {
  return value as unknown as NonNullable<Json>;
}

export async function getProfile(id: string): Promise<Profile | null> {
  return unwrap(await supabase.from("profiles").select("*").eq("id", id).maybeSingle());
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<void> {
  unwrap(await supabase.from("profiles").update(patch).eq("id", id));
}
