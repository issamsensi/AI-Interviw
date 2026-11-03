import Link from "next/link";

const PRODUCT_LINKS = [
  ["Start a simulation", "/upload"],
  ["How it works", "/#how-it-works"],
  ["Your profile", "/profil"],
  ["Sign in", "/connexion"],
] as const;

const INTERVIEW_TYPES = ["Behavioral", "Technical", "Case study", "HR screening", "Mixed"] as const;

const OUTCOMES = [
  "A score out of 100 for every answer",
  "Strengths and weak points, named plainly",
  "Concrete fixes to apply before the real call",
] as const;

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-sm font-semibold text-ivory">{title}</h2>
      <div className="mt-3.5">{children}</div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="bg-navy text-sage">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-8 lg:px-12 xl:px-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ivory">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-sand text-sm font-bold text-navy"
              >
                AI
              </span>
              <span>Interview Simulator</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#aec0b6]">
              Rehearse the interview before it costs you the job. Your resume is read, you answer
              out loud on camera, and every answer is scored.
            </p>
            <p className="mt-4 text-sm text-[#aec0b6]">
              One free guest interview — no account needed.{" "}
              <Link href="/connexion" className="font-medium text-sand hover:underline">
                Sign in
              </Link>{" "}
              to keep your CV and scores across devices.
            </p>
          </div>

          <FooterColumn title="Product">
            <ul className="space-y-2.5 text-sm">
              {PRODUCT_LINKS.map(([label, href]) => (
                <li key={href + label}>
                  <Link href={href} className="text-[#aec0b6] transition-colors hover:text-sand">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          <FooterColumn title="Interview types">
            <ul className="space-y-2.5 text-sm">
              {INTERVIEW_TYPES.map((type) => (
                <li key={type}>
                  <Link href="/upload" className="text-[#aec0b6] transition-colors hover:text-sand">
                    {type}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          <FooterColumn title="What you leave with">
            <ul className="space-y-2.5 text-sm text-[#aec0b6]">
              {OUTCOMES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </FooterColumn>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-[#aec0b6]">
          <p>© AI Interview Simulator — a practice tool, not a hiring decision.</p>
          <p>Video never leaves your browser. Audio is transcribed only when you answer.</p>
        </div>
      </div>
    </footer>
  );
}
