import { cache } from "react";
import { getPublicClient } from "./supabase/public";
import { getCurrentEvent } from "./supabase/current-event";

// Request-scoped only: never cache the admin switch across requests.
export const getRegistrationOpen = cache(async (): Promise<boolean> => {
  const client = getPublicClient();
  if (!client) return false;
  try {
    const { data, error } = await getCurrentEvent(client);
    return !error && data?.signups_open === true;
  } catch {
    return false;
  }
});
