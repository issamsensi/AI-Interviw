"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

export function AuthNav() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Env config is static per build, so this never changes after mount.
  const [configured] = useState(() => getSupabase() !== null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setEmail(data.session?.user.email ?? null);
        setReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (configured && !ready) return null;

  if (!email) {
    return (
      <Link href="/connexion" className="text-sm font-medium text-navy-900 hover:underline">
        Sign in
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <Link href="/profil" className="text-sm font-medium text-navy-900 hover:underline">
        Profile
      </Link>
      <span className="hidden max-w-[180px] truncate text-sm text-navy-600 md:block">{email}</span>
      <button
        type="button"
        className="text-sm font-medium text-navy-900 hover:underline"
        onClick={() => void getSupabase()?.auth.signOut()}
      >
        Sign out
      </button>
    </span>
  );
}
