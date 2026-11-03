import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Mic, PhoneOff, VideoOff } from "lucide-react";
import { ReprendreBanner } from "@/components/Reprendre";
import { Button } from "@/components/ui";

const FLOW = [
  ["01", "Your resume, decoded", "Upload a PDF, PNG, or JPEG. Skills, roles, and projects are extracted and shown for your review — nothing is invented."],
  ["02", "Pick the interview", "Behavioral, technical, case study, HR screening, or mixed. Choose the role, seniority, and question count."],
  ["03", "Answer out loud", "Your camera is on, the interviewer asks, you speak. A short silence sends your answer — like a real call."],
  ["04", "Leave with a verdict", "Score out of 100, strengths, weak points, and what to change before the real thing."],
] as const;

const PROOF = ["No account needed", "About 10 minutes", "Mic and camera stay in your browser"] as const;

const FEEDBACK = [
  "Structure answers with STAR, not chronology",
  "Quantify one result per story",
  "Cut filler, keep sentences short",
] as const;

/** Static preview of the interview room, so the product is visible above the fold. */
function RoomPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the interview room: Maya asks a question on a video call while you answer on camera, followed by a sample score of 82 out of 100."
      className="relative"
    >
      <div aria-hidden="true" className="overflow-hidden rounded-xl bg-[#172B3A] shadow-2xl ring-1 ring-navy-900/20">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#35536B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#35536B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#35536B]" />
          <span className="ml-2 truncate text-xs text-[#AEC0B6]">AI Interview — Maya Chen, Engineering Manager</span>
        </div>
        <div className="relative mx-3 aspect-[16/10] overflow-hidden rounded-lg bg-[#213D52]">
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-24 w-24 place-items-center rounded-full bg-[#C99B68] text-4xl font-medium text-[#172B3A] sm:h-28 sm:w-28">
              M
            </span>
          </div>
          <p className="absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-xs font-medium text-white">
            Maya Chen
          </p>
          <p className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white">Speaking…</p>
          <div className="absolute bottom-3 right-3 grid aspect-video w-28 place-items-center rounded-md bg-[#172B3A] ring-1 ring-white/25 sm:w-36">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#35536B] text-xs font-medium text-white">You</span>
          </div>
          <p className="absolute bottom-3 left-1/2 hidden w-[62%] -translate-x-1/2 rounded-md bg-black/65 px-3 py-1.5 text-center text-xs leading-snug text-white sm:block">
            <span className="mr-1.5 font-medium text-[#C99B68]">Maya</span>
            Tell me about a time you disagreed with your manager.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#213D52] text-white">
            <Mic className="h-4 w-4" />
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#ea4335] text-white">
            <VideoOff className="h-4 w-4" />
          </span>
          <span className="grid h-9 w-16 place-items-center rounded-full bg-[#ea4335] text-white">
            <PhoneOff className="h-4 w-4 -scale-x-100" />
          </span>
        </div>
      </div>
      <div aria-hidden="true" className="absolute -bottom-5 -left-3 rounded-lg bg-white px-4 py-3 shadow-lg ring-1 ring-navy-100 dark:bg-navy-50 sm:-left-6">
        <p className="text-xs font-medium text-navy-600">Sample verdict</p>
        <p className="text-2xl font-bold leading-tight tracking-tight text-navy-900">
          82<span className="text-sm font-medium text-navy-600">/100</span>
          <span className="ml-2 align-middle text-xs font-medium text-accent-700">Ready, with sharper stories</span>
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="relative left-1/2 -my-8 w-screen max-w-[100vw] -translate-x-1/2">
      {/* Hero — full laptop viewport: copy left, the product right */}
      <section className="flex items-center border-b border-navy-100 lg:min-h-[calc(100dvh-57px)]">
        <div className="mx-auto grid w-full max-w-[1440px] items-center gap-12 px-4 py-14 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-12 lg:py-10 xl:px-16">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-accent-700">
              <Mic aria-hidden="true" className="h-4 w-4" />
              Voice-first AI interview simulator
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-bold leading-[1.04] tracking-tight text-navy-900 sm:text-5xl xl:text-6xl">
              Rehearse the interview before it costs you the job.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-navy-600">
              Your resume is read, you are interviewed out loud with your camera on, and every
              answer is transcribed and scored. Ten minutes here beats ten seconds of panic there.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/upload">
                <Button className="px-6 py-3 text-base">
                  Start a simulation
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-navy-900 ring-1 ring-inset ring-navy-200 transition-colors hover:bg-navy-50"
              >
                See how it works
                <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-navy-600">
              {PROOF.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check aria-hidden="true" className="h-4 w-4 text-accent-600" />
                  {item}
                </li>
              ))}
            </ul>
            <ReprendreBanner />
          </div>
          <RoomPreview />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-label="How it works" className="mx-auto w-full max-w-[1440px] scroll-mt-6 px-4 py-14 sm:px-8 lg:px-12 xl:px-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-md text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
            From resume to verdict in four steps
          </h2>
          <p className="max-w-sm text-navy-600">One sitting, start to finish. Nothing to install, nothing to sign up for.</p>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {FLOW.map(([number, title, text], i) => (
            <div key={number} className={`border-t-2 border-navy-900 pt-4 lg:pr-8 ${i > 0 ? "lg:border-l lg:border-t-0 lg:border-navy-100 lg:pl-8 lg:pt-0" : ""}`}>
              <p className="font-mono text-sm font-semibold text-accent-700">{number}</p>
              <h3 className="mt-2 font-semibold text-navy-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Verdict band */}
      <section className="bg-navy text-ivory">
        <div className="mx-auto grid w-full max-w-[1440px] items-center gap-10 px-4 py-14 sm:px-8 lg:grid-cols-2 lg:px-12 xl:px-16">
          <div>
            <h2 className="max-w-md text-2xl font-bold tracking-tight sm:text-3xl">
              One simulation takes about ten minutes. The feedback lasts longer.
            </h2>
            <p className="mt-3 max-w-md leading-relaxed text-sage">
              Every answer is scored on its own, then rolled into one verdict you can act on before the real call.
            </p>
            <Link href="/upload" className="mt-7 inline-block">
              <Button className="bg-ivory px-6 py-3 text-base text-navy hover:bg-sage">
                Start a simulation
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="flex items-start gap-6">
            <p className="text-7xl font-bold tracking-tight">
              82<span className="text-2xl font-medium text-[#aec0b6]">/100</span>
            </p>
            <ul className="space-y-2.5 border-l border-white/15 pl-6 pt-2 text-sm text-sage">
              {FEEDBACK.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-100" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
