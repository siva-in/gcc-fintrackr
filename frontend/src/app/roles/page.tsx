"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { User, Organization, RoleAssignment } from "@/lib/types";
import { useAuthStore } from "@/stores/authStore";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus, Trash2, Search } from "lucide-react";

const COMPANY_ROLES = ["ADMIN", "VIEWER", "EDITOR", "APPROVER"];
const ORG_ROLES = ["MANAGER", "ACCOUNTANT", "LEADER", "HR", "USER"];

const roleColors: Record<string, string> = {
  ADMIN: "bg-red-50 text-red-700 ring-red-600/20",
  VIEWER: "bg-slate-100 text-slate-600 ring-slate-500/20",
  EDITOR: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  APPROVER: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  MANAGER: "bg-red-50 text-red-700 ring-red-600/20",
  ACCOUNTANT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  LEADER: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  HR: "bg-purple-50 text-purple-700 ring-purple-600/20",
  USER: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export default function RolesPage() {
  const { userLevel } = useAuthStore();
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);
  const [assigning, setAssigning] = useState(false);

  const [form, setForm] = useState({
    userId: "",
    type: "COMPANY" as "COMPANY" | "ORG",
    roleName: "VIEWER",
    orgId: "",
  });

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/roles");
      setAssignments(data.assignments);
    } catch {
      toast.error("Failed to load role assignments");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get("/users?limit=200");
      setAllUsers(data.users);
    } catch { /* non-critical */ }
  };

  const fetchOrgs = async () => {
    try {
      const { data } = await api.get("/organizations?limit=100");
      setAllOrgs(data.organizations);
    } catch { /* non-critical */ }
  };

  useEffect(() => { fetchAssignments(); fetchUsers(); fetchOrgs(); }, []);

  const openAssign = () => {
    setForm({ userId: "", type: "COMPANY", roleName: "VIEWER", orgId: "" });
    setModalOpen(true);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true);
    try {
      await api.post("/roles/assign", {
        userId: parseInt(form.userId),
        roleName: form.roleName,
        type: form.type,
        orgId: form.type === "ORG" ? parseInt(form.orgId) : undefined,
      });
      toast.success("Role assigned");
      setModalOpen(false);
      fetchAssignments();
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { errors?: { msg: string }[]; message?: string } } })?.response?.data;
      if (response?.errors?.length) {
        toast.error(response.errors.map((e) => e.msg).join("\n"));
      } else if (response?.message) {
        toast.error(response.message);
      } else {
        toast.error("Failed to assign role");
      }
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (assignment: RoleAssignment) => {
    if (!confirm(`Remove ${assignment.role.name} role from ${assignment.user.firstName} ${assignment.user.lastName}?`)) return;
    try {
      await api.delete(`/roles/${assignment.id}`);
      toast.success("Role assignment removed");
      fetchAssignments();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to remove";
      toast.error(msg);
    }
  };

  const canEdit = userLevel === "COMPANY";
  const filtered = assignments.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.user.firstName.toLowerCase().includes(q) ||
      a.user.lastName.toLowerCase().includes(q) ||
      a.user.username.toLowerCase().includes(q) ||
      a.role.name.toLowerCase().includes(q)
    );
  });

  const roleOptions = form.type === "COMPANY"
    ? COMPANY_ROLES.map((r) => ({ value: r, label: r }))
    : ORG_ROLES.map((r) => ({ value: r, label: r }));

  const typeOptions = [
    { value: "COMPANY", label: "Company Level" },
    { value: "ORG", label: "Org Level" },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Role Assignments</h1>
          <p className="text-slate-400 text-sm mt-1">Manage user roles across company and organizations</p>
        </div>
        {canEdit && (
          <Button onClick={openAssign}>
            <Plus size={16} className="mr-2" /> Assign Role
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, username or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Username</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Level</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Scope</th>
                {canEdit && <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    Loading...
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">No role assignments found</td></tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{a.user.firstName} {a.user.lastName}</td>
                    <td className="px-5 py-3.5 text-slate-500">{a.user.username}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={a.role.type === "COMPANY" ? "info" : "pending"}>{a.role.type}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${roleColors[a.role.name] || ""}`}>
                        {a.role.name}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {a.role.type === "COMPANY" ? "Company" : a.role.org?.name || "-"}
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => handleRemove(a)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Assign Role">
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">User</label>
            <select
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              required
            >
              <option value="">Select a user</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.username}) - {u.userLevel}
                </option>
              ))}
            </select>
          </div>

          <Select
            label="Role Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as "COMPANY" | "ORG", roleName: e.target.value === "COMPANY" ? "VIEWER" : "USER" })}
            options={typeOptions}
          />

          <Select
            label="Role"
            value={form.roleName}
            onChange={(e) => setForm({ ...form, roleName: e.target.value })}
            options={roleOptions}
          />

          {form.type === "ORG" && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Organization</label>
              <select
                value={form.orgId}
                onChange={(e) => setForm({ ...form, orgId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                required={form.type === "ORG"}
              >
                <option value="">Select an organization</option>
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={assigning}>Assign</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
