"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Root redirect — sends authenticated users to their role-appropriate dashboard.
 * The middleware handles unauthenticated users before this runs.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const role = data.user?.role;
        if (role === "personnel") router.replace("/personnel/dashboard");
        else if (role === "welfare_officer") router.replace("/welfare");
        else if (role === "commander") router.replace("/commander");
        else if (role === "admin") router.replace("/admin");
        else router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7f8" }}>
      <div style={{ textAlign: "center", color: "#8b9ba3" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⟳</div>
        <p style={{ fontSize: 14 }}>Loading SAHAYAK…</p>
      </div>
    </div>
  );
}
