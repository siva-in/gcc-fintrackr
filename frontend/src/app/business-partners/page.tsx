"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, Search } from "lucide-react";
import Pagination from "@/components/ui/Pagination";

interface BizPartner {
  id: number;
  bpType: string;
  bpName: string;
  contactName: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  isActive: boolean;
}

export default function BusinessPartnersPage() {
  const [bizPartners, setBizPartners] = useState<BizPartner[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBizPartner, setEditingBizPartner] = useState<BizPartner | null>(null);
  const [form, setForm] = useState({ bpType: "VENDOR", bpName: "", contactName: "", mobile: "", email: "", address: "", gstNumber: "", isActive: true });
  const [saving, setSaving] = useState(false);

  const fetchBizPartners = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/biz-partners?page=${page}&search=${search}&limit=10`);
      setBizPartners(data.bizPartners);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load business partners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBizPartners(); }, [page, search]);

  const openCreate = () => {
    setEditingBizPartner(null);
    setForm({ bpType: "VENDOR", bpName: "", contactName: "", mobile: "", email: "", address: "", gstNumber: "", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (bp: BizPartner) => {
    setEditingBizPartner(bp);
    setForm({
      bpType: bp.bpType,
      bpName: bp.bpName,
      contactName: bp.contactName || "",
      mobile: bp.mobile || "",
      email: bp.email || "",
      address: bp.address || "",
      gstNumber: bp.gstNumber || "",
      isActive: bp.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bpName.trim()) return toast.error("Name is required");

    setSaving(true);
    try {
      const payload = { ...form };
      if (editingBizPartner) {
        await api.put(`/biz-partners/${editingBizPartner.id}`, payload);
        toast.success("Business Partner updated");
      } else {
        await api.post("/biz-partners", payload);
        toast.success("Business Partner created");
      }
      setModalOpen(false);
      fetchBizPartners();
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

  const handleDelete = async (bp: BizPartner) => {
    if (!confirm(`Delete business partner "${bp.bpName}"?`)) return;
    try {
      await api.delete(`/biz-partners/${bp.id}`);
      toast.success("Business Partner deleted");
      fetchBizPartners();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  };

  const typeVariant = (type: string) => {
    if (type === "INSURANCE") return "info" as const;
    if (type === "VENDOR") return "warning" as const;
    return "pending" as const;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Business Partners</h1>
          <p className="text-slate-400 text-sm mt-1">Manage vendors and insurance partners</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-2" /> Add Partner
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full sm:max-w-xs">
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Name, contact, email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Type</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Contact</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Mobile</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Email</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    Loading...
                  </div>
                </td></tr>
              ) : bizPartners.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No business partners found</td></tr>
              ) : (
                bizPartners.map((bp) => (
                  <tr key={bp.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{bp.bpName}</td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <Badge variant={typeVariant(bp.bpType)}>{bp.bpType}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell">{bp.contactName || "-"}</td>
                    <td className="px-5 py-3.5 text-slate-500 hidden lg:table-cell">{bp.mobile || "-"}</td>
                    <td className="px-5 py-3.5 text-slate-500 hidden lg:table-cell">{bp.email || "-"}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={bp.isActive ? "success" : "danger"}>{bp.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => openEdit(bp)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(bp)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <Pagination page={page} totalPages={pagination.pages} total={pagination.total} limit={10} onPageChange={setPage} />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingBizPartner ? "Edit Business Partner" : "Add Business Partner"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type <span className="text-red-500">*</span></label>
              <select
                value={form.bpType}
                onChange={(e) => setForm({ ...form, bpType: e.target.value })}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="VENDOR">Vendor</option>
                <option value="INSURANCE">Insurance</option>
                <option value="CORPORATE">Corporate</option>
                <option value="LAB">Lab</option>
                <option value="RADIOLOGY">Radiology</option>
                <option value="GOVERNMENT">Government</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Name <span className="text-red-500">*</span></label>
              <input
                value={form.bpName}
                onChange={(e) => setForm({ ...form, bpName: e.target.value })}
                placeholder="Partner name"
                required
                className="w-full px-3.5 py-2.5 border rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 transition-all border-slate-200"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Contact Person" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Contact name" />
            <Input label="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="Mobile number" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" />
            <Input label="GST Number" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} placeholder="GST number" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Address"
              rows={2}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-600">Active</label>
            <button
              type="button"
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? "bg-emerald-500" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingBizPartner ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
