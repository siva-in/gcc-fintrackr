"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Organization } from "@/lib/types";
import { useAuthStore } from "@/stores/authStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, Search } from "lucide-react";

interface Role {
  id: number;
  name: string;
  type: "COMPANY" | "ORG";
  orgId: number | null;
  org: { id: number; name: string } | null;
  _count: { userRoles: number };
}

export default function RoleMasterPage() {
  const { userLevel } = useAuthStore();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: "", type: "COMPANY" as "COMPANY" | "ORG", orgId: "" });
  const [saving, setSaving] = useState(false);
  const [allOrgs, setAllOrgs] = useState<Organization[]>([]);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/roles/master");
      setRoles(data.roles);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgs = async () => {
    try {
      const { data } = await api.get("/organizations?limit=100");
      setAllOrgs(data.organizations);
    } catch { /* non-critical */ }
  };

  useEffect(() => { fetchRoles(); fetchOrgs(); }, []);

  const openCreate = () => {
    setEditingRole(null);
    setForm({ name: "", type: "COMPANY", orgId: "" });
    setModalOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setForm({ name: role.name, type: role.type, orgId: role.orgId ? String(role.orgId) : "" });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingRole) {
        await api.put(`/roles/master/${editingRole.id}`, { name: form.name });
        toast.success("Role updated");
      } else {
        await api.post("/roles/master", {
          name: form.name,
          type: form.type,
          orgId: form.type === "ORG" ? parseInt(form.orgId) : undefined,
        });
        toast.success("Role created");
      }
      setModalOpen(false);
      fetchRoles();
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { errors?: { msg: string }[]; message?: string } } })?.response?.data;
      if (response?.errors?.length) {
        toast.error(response.errors.map((e) => e.msg).join("\n"));
      } else if (response?.message) {
        toast.error(response.message);
      } else {
        toast.error("Operation failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role: Role) => {
    if (role._count.userRoles > 0 && !confirm(`This role is assigned to ${role._count.userRoles} user(s). Delete anyway?`)) return;
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api.delete(`/roles/master/${role.id}`);
      toast.success("Role deleted");
      fetchRoles();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  };

  const canEdit = userLevel === "COMPANY";
  const filtered = roles.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || r.org?.name.toLowerCase().includes(q);
  });

  const typeOptions = [
    { value: "COMPANY", label: "Company" },
    { value: "ORG", label: "Organization" },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Role Master</h1>
          <p className="text-slate-400 text-sm mt-1">Define and manage roles across the system</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" /> Add Role
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search roles..."
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
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Scope</th>
                <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Users</th>
                {canEdit && <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    Loading...
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">No roles found</td></tr>
              ) : (
                filtered.map((role) => (
                  <tr key={role.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{role.name}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={role.type === "COMPANY" ? "info" : "pending"}>{role.type}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{role.org?.name || "-"}</td>
                    <td className="px-5 py-3.5 text-center text-slate-500">{role._count.userRoles}</td>
                    {canEdit && (
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => openEdit(role)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(role)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 ml-1 transition-colors">
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingRole ? "Edit Role" : "Create Role"}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Role Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

          {!editingRole && (
            <>
              <Select
                label="Type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "COMPANY" | "ORG", orgId: "" })}
                options={typeOptions}
              />
              {form.type === "ORG" && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Organization</label>
                  <select
                    value={form.orgId}
                    onChange={(e) => setForm({ ...form, orgId: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  >
                    <option value="">Select an organization</option>
                    {allOrgs.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingRole ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
