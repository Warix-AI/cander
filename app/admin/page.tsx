"use client";

import { AdminProvider } from "@/components/admin/AdminProvider";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminPage() {
  return (
    <AdminProvider>
      <AdminShell />
    </AdminProvider>
  );
}
