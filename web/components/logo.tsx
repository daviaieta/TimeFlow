import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-8", className)}
    >
      <rect x="14" y="4" width="8" height="14" rx="3" fill="#3730a3" />
      <rect x="36" y="4" width="8" height="14" rx="3" fill="#3730a3" />
      <rect x="4" y="10" width="52" height="50" rx="12" fill="#3730a3" />
      <path
        d="M18 36l10 10 18-21"
        stroke="#22d3ee"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="55" cy="11" r="7" fill="#fbbf24" />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <span className="text-lg font-semibold tracking-tight">Time Flow</span>
    </span>
  );
}
