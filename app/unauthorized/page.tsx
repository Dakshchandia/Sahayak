import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7f8", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <ShieldCheck size={48} style={{ color: "#147d6e", margin: "0 auto 20px" }} />
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Access restricted</h1>
        <p style={{ color: "#687b83", marginBottom: 24 }}>
          You do not have permission to view this page. If you believe this is an error,
          contact your system administrator.
        </p>
        <Link
          href="/"
          style={{ background: "#137e6d", color: "white", borderRadius: 7, padding: "11px 22px",
            fontSize: 14, fontWeight: 600, textDecoration: "none", display: "inline-block" }}
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
