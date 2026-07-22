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
import { Plus, Edit2, Trash2, Search, Eye } from "lucide-react";
import Link from "next/link";

export default function OrganizationsPage() {
  const { userLevel } = useAuthStore();
  const [orgs, setOrgs] = useState<(Organization & { _count?: { orgUsers: number; requests: number } })[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [form, setForm] = useState({ name: "", status: "ACTIVE" });
  const [saving, setSaving] = useState(false);

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/organizations?page=${page}&search=${search}&limit=10`);
      setOrgs(data.organizations);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrgs(); }, [page, search]);

  const openCreate = () => {
    setEditingOrg(null);
    setForm({ name: "", status: "ACTIVE" });
    setModalOpen(true);
  };

  const openEdit = (org: Organization) => {
    setEditingOrg(org);
    setForm({ name: org.name, status: org.status });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingOrg) {
        await api.put(`/organizations/${editingOrg.id}`, form);
        toast.success("Organization updated");
      } else {
        await api.post("/organizations", form);
        toast.success("Organization created");
      }
      setModalOpen(false);
      fetchOrgs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Operation failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (org: Organization) => {
    if (!confirm(`Delete organization "${org.name}"?`)) return;
    try {
      await api.delete(`/organizations/${org.id}`);
      toast.success("Organization deleted");
      fetchOrgs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  };

  const canEdit = userLevel === "COMPANY";

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Organizations</h1>
          <p className="text-slate-400 text-sm mt-1">Manage organizations and their members</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" /> Add Organization
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Members</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Requests</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>
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
              ) : orgs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">No organizations found</td></tr>
              ) : (
                orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{org.name}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={org.status === "ACTIVE" ? "success" : "danger"}>{org.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{org._count?.orgUsers || 0}</td>
                    <td className="px-5 py-3.5 text-slate-500">{org._count?.requests || 0}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/organizations/${org.id}`} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 inline-flex transition-colors">
                        <Eye size={16} />
                      </Link>
                      {canEdit && (
                        <>
                          <button onClick={() => openEdit(org)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 ml-1 transition-colors">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(org)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 ml-1 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200/60 bg-slate-50/50">
            <p className="text-sm text-slate-400">
              Showing {(pagination.page - 1) * 10 + 1} to {Math.min(pagination.page * 10, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3.5 py-1.5 text-sm rounded-lg font-medium transition-all ${p === page ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingOrg ? "Edit Organization" : "Create Organization"}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Organization Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingOrg ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
