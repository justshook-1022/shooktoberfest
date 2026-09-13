"use client";

import Link from "next/link";
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

  return (
    <Link
      className="header-icon-link header-account"
      href={signedIn ? "/me" : "/login?next=/me"}
      aria-label={signedIn ? "My profile" : "Sign in"}
    >
      <svg className="account-icon" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="11" r="6" />
        <path d="M6.5 31c0-7.1 4.8-11.5 11.5-11.5S29.5 23.9 29.5 31Z" />
      </svg>
    </Link>
  );
}
