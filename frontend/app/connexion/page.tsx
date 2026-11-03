"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = getSupabase() !== null;

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    if (authError) setError(authError.message);
    else setSent(true);
  }

  async function signInWithGoogle() {
    const supabase = getSupabase();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    setBusy(false);
    if (authError) setError(authError.message);
  }

  return (
    <div>
      <PageHeader
        title="Sign in"
        subtitle="Accounts save your CV, interview history, and scores across devices. Guests get one free interview — no account needed to try."
      />
      <Card className="max-w-md">
        {!configured ? (
          <Alert tone="info" title="Accounts are not configured yet">
            <p>
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable
              sign-in. Until then, you can still{" "}
              <Link href="/upload" className="font-medium underline">
                run one guest interview
              </Link>
              .
            </p>
          </Alert>
        ) : sent ? (
          <Alert tone="success" title="Check your inbox">
            <p>We sent a sign-in link to {email.trim()}. Open it in this browser to finish signing in — your guest progress will be attached to your account automatically.</p>
          </Alert>
        ) : (
          <>
            <form onSubmit={sendMagicLink} noValidate>
              <label htmlFor="signin-email" className="block text-sm font-medium text-navy-900">
                Email
              </label>
              <input
                id="signin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-1.5 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-sm text-navy-900 dark:bg-navy-50 placeholder:text-navy-600/60 focus:border-accent-600"
              />
              <Button type="submit" disabled={busy || !email.trim()} className="mt-4 w-full">
                <Mail aria-hidden="true" className="h-4 w-4" />
                {busy ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
            <div className="my-4 flex items-center gap-3 text-xs text-navy-600" aria-hidden="true">
              <span className="h-px flex-1 bg-navy-100" />
              or
              <span className="h-px flex-1 bg-navy-100" />
            </div>
            <Button variant="secondary" disabled={busy} onClick={() => void signInWithGoogle()} className="w-full">
              Continue with Google
            </Button>
            {error && (
              <div className="mt-4">
                <Alert tone="error" title="Sign-in failed">
                  <p>{error}</p>
                </Alert>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
