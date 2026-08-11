"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AccountGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      setReady(true);
    }

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Checking session...
      </main>
    );
  }

  return <>{children}</>;
}
