"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile } from "@/lib/auth";

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";
  const [authorized, setAuthorized] = useState(isLoginPage);

  useEffect(() => {
    if (isLoginPage) {
      return;
    }

    let active = true;

    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace("/admin/login");
        return;
      }

      const profile = await getProfile(user.id);

      if (!active) return;

      if (!profile?.is_admin) {
        router.replace("/account");
        return;
      }

      setAuthorized(true);
    }

    checkUser();

    return () => {
      active = false;
    };
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Checking admin access...
      </main>
    );
  }

  return <>{children}</>;
}
