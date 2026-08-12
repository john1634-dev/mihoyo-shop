import AdminGuard from "@/components/AdminGuard";
import AdminShell from "@/components/AdminShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <AdminShell>{children}</AdminShell>
    </AdminGuard>
  );
}
