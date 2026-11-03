import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function Button({ variant = "primary", className = "", type = "button", ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-navy text-ivory hover:bg-navy-700 disabled:bg-navy-200 dark:bg-sand dark:text-navy dark:hover:bg-[#ddb98a] dark:disabled:bg-navy-200",
    secondary: "bg-white text-navy-900 ring-1 ring-inset ring-navy-200 hover:bg-navy-50 disabled:text-navy-200 dark:bg-navy-50",
    danger: "bg-red-700 text-white hover:bg-red-600 disabled:bg-red-200",
    ghost: "text-navy-700 hover:bg-navy-50 disabled:text-navy-200",
  } as const;
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-navy-100 bg-white p-6 shadow-sm dark:bg-navy-50 ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, step }: { title: string; subtitle?: string; step?: string }) {
  return (
    <div className="mb-6">
      {step && <p className="mb-1 text-sm font-medium text-accent-700">{step}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-navy-600">{subtitle}</p>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-navy-600">
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </span>
  );
}

type AlertTone = "error" | "info" | "success";

export function Alert({ tone, title, children }: { tone: AlertTone; title?: string; children: ReactNode }) {
  const config = {
    error: { classes: "border-red-200 bg-red-50 text-red-900", Icon: AlertTriangle },
    info: { classes: "border-navy-100 bg-navy-50 text-navy-800", Icon: Info },
    success: { classes: "border-accent-100 bg-accent-50 text-accent-700", Icon: CheckCircle2 },
  } as const;
  const { classes, Icon } = config[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border p-4 ${classes}`}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          {title && <p className="font-semibold">{title}</p>}
          <div className="mt-1 text-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm text-navy-600">
        <span>{label}</span>
        <span aria-live="polite">
          {value} / {max}
        </span>
      </div>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-2 overflow-hidden rounded-full bg-navy-100">
        <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50 px-6 py-10 text-center">
      <p className="font-medium text-navy-800">{title}</p>
      {children && <div className="mt-2 text-sm text-navy-600">{children}</div>}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-red-700">
      {message}
    </p>
  );
}
