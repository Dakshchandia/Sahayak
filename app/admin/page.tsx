"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Edit, Key, ShieldCheck, CheckCheck,
  Search, RefreshCw, Info, Building2, X, Eye, EyeOff
} from "lucide-react";
import { AppShell } from "@/components/shell";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { toast, Toaster } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  personnel: "Personnel",
  welfare_officer: "Welfare Officer",
  commander: "Commander",
  admin: "Administrator",
};

const ROLE_COLORS: Record<string, string> = {
  personnel: "#4a8a72", welfare_officer: "#5a7aa8", commander: "#a06030", admin: "#7a5aa8",
};

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "units">("users");
  const [modal, setModal] = useState<null | "create_user" | "create_unit" | "edit_user" | "reset_pw">(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Create user form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [newRole, setNewRole] = useState<string>("personnel");
  const [newUnitId, setNewUnitId] = useState<string>("");
  const [newPersonnelId, setNewPersonnelId] = useState("");

  // Create unit form
  const [unitName, setUnitName] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [unitDesc, setUnitDesc] = useState("");
  const [unitMinGroup, setUnitMinGroup] = useState(10);

  // Reset pw form
  const [resetPw, setResetPw] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, usersRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/admin/users?q=${encodeURIComponent(search)}&role=${roleFilter}`),
      ]);
      if (!meRes.ok) { router.push("/login"); return; }
      const me = await meRes.json();
      if (me.user?.role !== "admin") { router.push("/unauthorized"); return; }
      setUser(me.user);
      setCsrfToken(me.csrfToken ?? sessionStorage.getItem("csrfToken") ?? "");
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.users ?? []);
        setUnits(d.units ?? []);
      }
    } catch { toast.error("Failed to load admin data."); }
    finally { setLoading(false); }
  }, [router, search, roleFilter]);

  useEffect(() => { load(); }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", csrfToken, name: newName, email: newEmail,
          password: newPassword, role: newRole,
          unitId: newUnitId ? parseInt(newUnitId) : null,
          personnelId: newPersonnelId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("User created. They must change their password on first login.");
      setModal(null); resetCreateForm(); load();
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  async function updateUser(field: string, value: unknown) {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", csrfToken, userId: editTarget.id, [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("User updated.");
      setModal(null); load();
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_password", csrfToken, userId: editTarget.id, newPassword: resetPw }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Password reset. All sessions invalidated.");
      setModal(null); setResetPw("");
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  async function createUnit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create", csrfToken, name: unitName,
          code: unitCode, description: unitDesc, minimumGroupSize: unitMinGroup,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("Unit created.");
      setModal(null); setUnitName(""); setUnitCode(""); setUnitDesc(""); setUnitMinGroup(10);
      load();
    } catch { toast.error("Network error."); }
    finally { setSaving(false); }
  }

  function resetCreateForm() {
    setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("personnel");
    setNewUnitId(""); setNewPersonnelId("");
  }

  if (!user) return null;

  return (
    <AppShell user={user} csrfToken={csrfToken}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>User and unit management</h1>
          <p>Create accounts, assign units and manage roles. Role changes are server-enforced.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="secondary" onClick={() => { setModal("create_unit"); }}>
            <Building2 size={17} /> New unit
          </button>
          <button className="primary" onClick={() => { setModal("create_user"); }}>
            <Plus size={17} /> New user
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e0e8eb", paddingBottom: 0 }}>
        {(["users", "units"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 600,
              borderBottom: activeTab === tab ? "2px solid #147d6e" : "2px solid transparent",
              color: activeTab === tab ? "#147d6e" : "#637780", marginBottom: -2,
            }}
          >
            {tab === "users" ? `Users (${users.length})` : `Units (${units.length})`}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <section className="panel">
          <div className="filters" style={{ marginBottom: 16 }}>
            <label className="search">
              <Search size={18} />
              <input
                placeholder="Search name, email or ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search users"
              />
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
              style={{ border: "1px solid #dce5e8", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}
            >
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NAME</TableHead>
                  <TableHead>EMAIL</TableHead>
                  <TableHead>ROLE</TableHead>
                  <TableHead>UNIT</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>LAST LOGIN</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="avatar" style={{ fontSize: 11 }}>
                          {u.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
                        </span>
                        <div>
                          <b style={{ fontSize: 13 }}>{u.name}</b>
                          {u.personnelId && <small style={{ display: "block", color: "#8b9ba3", fontSize: 12 }}>{u.personnelId}</small>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>{u.email}</TableCell>
                    <TableCell>
                      <span style={{
                        fontSize: 12, padding: "3px 8px", borderRadius: 4,
                        background: "#f0f4f5", color: ROLE_COLORS[u.role] ?? "#637780", fontWeight: 600
                      }}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>
                      {units.find((un) => un.id === u.unitId)?.name ?? <span className="muted">—</span>}
                    </TableCell>
                    <TableCell>
                      <span style={{
                        fontSize: 12, padding: "3px 8px", borderRadius: 4,
                        background: u.isActive ? "#e9f4ee" : "#fdf2f2",
                        color: u.isActive ? "#509479" : "#bb4f46",
                      }}>
                        {u.isActive ? "Active" : "Disabled"}
                      </span>
                    </TableCell>
                    <TableCell style={{ fontSize: 12, color: "#8b9ba3" }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="icon-button"
                          title="Edit user"
                          onClick={() => { setEditTarget(u); setModal("edit_user"); }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title="Reset password"
                          onClick={() => { setEditTarget(u); setModal("reset_pw"); }}
                        >
                          <Key size={16} />
                        </button>
                        <button
                          className="icon-button"
                          title={u.isActive ? "Disable account" : "Enable account"}
                          style={{ color: u.isActive ? "#bb4f46" : "#509479" }}
                          onClick={() => updateUser("isActive", !u.isActive)}
                        >
                          {u.isActive ? <X size={16} /> : <CheckCheck size={16} />}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="empty compact"><Search size={20} /><p>No users found.</p></div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {activeTab === "units" && (
        <section className="panel">
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UNIT NAME</TableHead>
                  <TableHead>CODE</TableHead>
                  <TableHead>DESCRIPTION</TableHead>
                  <TableHead>MIN. GROUP SIZE</TableHead>
                  <TableHead>CREATED</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell><b style={{ fontSize: 13 }}>{u.name}</b></TableCell>
                    <TableCell><code style={{ fontSize: 12, background: "#f0f4f5", padding: "2px 6px", borderRadius: 4 }}>{u.code}</code></TableCell>
                    <TableCell style={{ fontSize: 13, color: "#687b83" }}>{u.description ?? "—"}</TableCell>
                    <TableCell style={{ fontSize: 13 }}>{u.minimumGroupSize}</TableCell>
                    <TableCell style={{ fontSize: 12, color: "#8b9ba3" }}>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Modals */}
      {modal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(8,28,36,.45)",
          display: "grid", placeItems: "center", zIndex: 50, padding: 24
        }}>
          <div style={{ background: "white", borderRadius: 12, padding: 28, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>

            {modal === "create_user" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2>Create new user</h2>
                  <button className="icon-button" onClick={() => setModal(null)}><X size={20} /></button>
                </div>
                <form onSubmit={createUser} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "Full name", value: newName, setter: setNewName, type: "text", required: true },
                    { label: "Email address", value: newEmail, setter: setNewEmail, type: "email", required: true },
                    { label: "Personnel ID (optional)", value: newPersonnelId, setter: setNewPersonnelId, type: "text", required: false },
                  ].map(({ label, value, setter, type, required }) => (
                    <div key={label}>
                      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>{label}</label>
                      <input type={type} value={value} onChange={(e) => setter(e.target.value)}
                        required={required}
                        style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Temporary password</label>
                    <div style={{ position: "relative" }}>
                      <input type={showPw ? "text" : "password"} value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)} required
                        style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 42px 9px 12px", fontSize: 14, boxSizing: "border-box" }} />
                      <button type="button" onClick={() => setShowPw((v) => !v)}
                        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#8b9ba3" }}>
                        {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                    <small className="muted">Min 8 chars, one uppercase, one number. User must change on first login.</small>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Role</label>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}>
                      {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Unit assignment</label>
                    <select value={newUnitId} onChange={(e) => setNewUnitId(e.target.value)}
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}>
                      <option value="">No unit assigned</option>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button type="submit" className="primary" disabled={saving}>{saving ? "Creating…" : "Create user"}</button>
                    <button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button>
                  </div>
                </form>
              </>
            )}

            {modal === "edit_user" && editTarget && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2>Edit {editTarget.name}</h2>
                  <button className="icon-button" onClick={() => setModal(null)}><X size={20} /></button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Role</label>
                    <select defaultValue={editTarget.role}
                      onChange={(e) => updateUser("role", e.target.value)}
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}>
                      {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Unit assignment</label>
                    <select defaultValue={editTarget.unitId ?? ""}
                      onChange={(e) => updateUser("unitId", e.target.value ? parseInt(e.target.value) : null)}
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14 }}>
                      <option value="">No unit assigned</option>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <p className="muted">Changes take effect on the user's next request. Role changes are server-enforced.</p>
                </div>
              </>
            )}

            {modal === "reset_pw" && editTarget && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2>Reset password</h2>
                  <button className="icon-button" onClick={() => setModal(null)}><X size={20} /></button>
                </div>
                <p style={{ marginBottom: 16, fontSize: 14 }}>
                  Resetting the password for <b>{editTarget.name}</b> will invalidate all their active sessions.
                </p>
                <form onSubmit={resetPassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>New temporary password</label>
                    <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} required minLength={8}
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" className="primary" style={{ background: "#bb4f46" }} disabled={saving}>
                      {saving ? "Resetting…" : "Reset password"}
                    </button>
                    <button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button>
                  </div>
                </form>
              </>
            )}

            {modal === "create_unit" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2>Create new unit</h2>
                  <button className="icon-button" onClick={() => setModal(null)}><X size={20} /></button>
                </div>
                <form onSubmit={createUnit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Unit name</label>
                    <input type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)} required
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Unit code</label>
                    <input type="text" value={unitCode} onChange={(e) => setUnitCode(e.target.value.toUpperCase())} required
                      placeholder="e.g. ALPHA"
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Description</label>
                    <input type="text" value={unitDesc} onChange={(e) => setUnitDesc(e.target.value)}
                      style={{ width: "100%", border: "1px solid #dce5e8", borderRadius: 6, padding: "9px 12px", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                      Minimum group size for commander view <b>({unitMinGroup})</b>
                    </label>
                    <input type="range" min={3} max={50} value={unitMinGroup} onChange={(e) => setUnitMinGroup(parseInt(e.target.value))}
                      style={{ width: "100%" }} />
                    <small className="muted">Groups below this size are suppressed in commander aggregates.</small>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" className="primary" disabled={saving}>{saving ? "Creating…" : "Create unit"}</button>
                    <button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> ADMIN PANEL · SAHAYAK</span>
        <span>Role changes are server-enforced and audit-logged.</span>
      </footer>
      <Toaster richColors position="bottom-right" />
    </AppShell>
  );
}
