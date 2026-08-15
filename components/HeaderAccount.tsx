"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "../lib/supabase/client";

export default function HeaderAccount() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session?.user)));
    return () => data.subscription.unsubscribe();
  }, []);

  return <a className="header-login" href={signedIn ? "/me" : "/login?next=/me"}>{signedIn ? "My profile" : "Log in"}</a>;
}
