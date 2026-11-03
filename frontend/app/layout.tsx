import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { AuthNav } from "@/components/AuthNav";
import { Footer } from "@/components/Footer";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "AI Interview Simulator",
  description:
    "Practice job interviews under realistic conditions: analyzed resume, adaptive voice questions, detailed evaluation.",
};

// Runs before first paint so the saved (or OS) theme never flashes wrong.
const THEME_INIT_SCRIPT = `try{var t=window.localStorage.getItem("aiw.theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <header className="border-b border-navy-100 bg-background">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-3 sm:px-8 lg:px-12 xl:px-16">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-sm font-bold text-ivory"
              >
                AI
              </span>
              <span>Interview Simulator</span>
            </Link>
            <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-4">
              <AuthNav />
              <ThemeToggle />
              <Link
                href="/upload"
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-ivory transition-colors hover:bg-navy-700 dark:bg-sand dark:text-navy dark:hover:bg-[#ddb98a]"
              >
                Start a simulation
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
