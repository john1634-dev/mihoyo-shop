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
      className="border-y border-[var(--border)] bg-[var(--surface)]/80"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-8 md:px-6 lg:grid-cols-4 lg:gap-6 lg:py-10">
        {TRUST_ITEMS.map(({ title, description, Icon }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-card)] text-blue-400">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                {description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
