import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function BoltIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M13 2L4.8 13.2h6.1L9.7 22l9.5-12.7h-6.4L13 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BallIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.7" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.4l3.7 2.7-1.4 4.3H9.7l-1.4-4.3L12 7.4zM8.3 10.1L5 9.3M15.7 10.1l3.3-.8M9.7 14.4l-2 3M14.3 14.4l2 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 3.4l7 2.7v5.3c0 4.5-2.8 7.7-7 9.2-4.2-1.5-7-4.7-7-9.2V6.1l7-2.7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.6 12.1l2.2 2.2 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.8" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="5.5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.8v3.4M16 3.8v3.4M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 7.2l7 5.8 7-5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8.4 5.1l1.5 3.3-2 1.4c1 2.2 2.6 4 4.9 5.2l1.5-2 3.5 1.6-.6 3.7c-6.3.4-11.5-4.7-11-11l2.2-.2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 21s6-5.5 6-11a6 6 0 10-12 0c0 5.5 6 11 6 11z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SocialIcon({ label, ...props }: IconProps & { label: string }) {
  const text = label === "Instagram" ? "IG" : label === "TikTok" ? "TT" : label === "YouTube" ? "YT" : "FB";

  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}>
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" />
      <text
        x="20"
        y="24"
        textAnchor="middle"
        fontSize="10"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fill="currentColor"
      >
        {text}
      </text>
    </svg>
  );
}
