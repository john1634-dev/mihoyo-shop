export function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`fill-current ${className}`}>
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.82c0 1.96.52 3.87 1.52 5.56L2 22l4.79-1.56a10.1 10.1 0 0 0 5.25 1.42h.01c5.46 0 9.89-4.4 9.89-9.82C21.94 6.4 17.5 2 12.04 2zm5.76 14.03c-.24.67-1.4 1.23-1.93 1.31-.5.08-1.12.11-1.81-.11-.42-.14-.95-.31-1.64-.61-2.88-1.25-4.76-4.15-4.9-4.34-.14-.19-1.17-1.56-1.17-2.98 0-1.42.74-2.12 1.01-2.41.26-.29.58-.36.77-.36h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.31.38-.44.51-.14.14-.29.29-.12.56.17.28.74 1.22 1.59 1.98 1.1.97 2.02 1.27 2.3 1.41.29.14.48.21.55.33.07.12.07.7-.17 1.37z" />
    </svg>
  );
}

export function ShopeeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`fill-current ${className}`}>
      <path d="M12 2C9.24 2 7 4.24 7 7v1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-2V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v1H9V7c0-1.66 1.34-3 3-3z" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
