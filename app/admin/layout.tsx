import { AuthProvider } from "@/components/app/AuthProvider";
import { AppearanceProvider } from "@/components/theme/AppearanceProvider";
import { AdminAccessGate } from "@/components/admin/AdminAccessGate";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AppearanceProvider>
        <AdminAccessGate>
          <div className="h-svh overflow-hidden bg-background text-foreground">
            {children}
          </div>
        </AdminAccessGate>
      </AppearanceProvider>
    </AuthProvider>
  );
}
