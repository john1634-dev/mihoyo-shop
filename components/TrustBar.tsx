import { ShieldCheckIcon, TruckIcon, ChatIcon, LifeRingIcon } from "@/components/icons";

const TRUST_ITEMS = [
  {
    title: "Secure Purchase",
    description: "Off-site checkout via trusted channels",
    Icon: ShieldCheckIcon,
  },
  {
    title: "Fast Delivery",
    description: "Account handover after confirmed purchase",
    Icon: TruckIcon,
  },
  {
    title: "WhatsApp Support",
    description: "Message us directly for quick replies",
    Icon: ChatIcon,
  },
  {
    title: "After-Sales Support",
    description: "Help available after your purchase",
    Icon: LifeRingIcon,
  },
] as const;

export default function TrustBar() {
  return (
    <section
      aria-label="Trust highlights"
      className="border-y border-[var(--border)] bg-white"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-5 md:px-6 lg:grid-cols-4 lg:gap-5 lg:py-6">
        {TRUST_ITEMS.map(({ title, description, Icon }) => (
          <div key={title} className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--accent-strong)]">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-[var(--muted)]">
                {description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
