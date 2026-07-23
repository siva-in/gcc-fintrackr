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

interface Doctor {
  id: number;
  name: string;
  degree: string;
  descName: string;
  isActive: boolean;
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [form, setForm] = useState({ name: "", degree: "", descName: "", isActive: true });
  const [saving, setSaving] = useState(false);

  const fetchDoctors = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/doctors?page=${page}&search=${search}&limit=10`);
      setDoctors(data.doctors);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load doctors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDoctors(); }, [page, search]);

  const openCreate = () => {
    setEditingDoctor(null);
    setForm({ name: "", degree: "", descName: "", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (doctor: Doctor) => {
    setEditingDoctor(doctor);
    setForm({ name: doctor.name, degree: doctor.degree, descName: doctor.descName, isActive: doctor.isActive });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingDoctor) {
        await api.put(`/doctors/${editingDoctor.id}`, form);
        toast.success("Doctor updated");
      } else {
        await api.post("/doctors", form);
        toast.success("Doctor created");
      }
      setModalOpen(false);
      fetchDoctors();
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

  const handleDelete = async (doctor: Doctor) => {
    if (!confirm(`Delete doctor "${doctor.name}"?`)) return;
    try {
      await api.delete(`/doctors/${doctor.id}`);
      toast.success("Doctor deleted");
      fetchDoctors();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Doctors</h1>
          <p className="text-slate-400 text-sm mt-1">Manage doctor records</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-2" /> Add Doctor
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search doctors..."
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
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Name</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Degree</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Display Name</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Status</th>
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
              ) : doctors.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">No doctors found</td></tr>
              ) : (
                doctors.map((doctor) => (
                  <tr key={doctor.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700 hidden sm:table-cell">{doctor.name}</td>
                    <td className="px-5 py-3.5 text-slate-600 hidden md:table-cell">{doctor.degree}</td>
                    <td className="px-5 py-3.5 text-slate-500">{doctor.descName}</td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <Badge variant={doctor.isActive ? "success" : "danger"}>{doctor.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={() => openEdit(doctor)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(doctor)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 ml-1 transition-colors">
                        <Trash2 size={16} />
                      </button>
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingDoctor ? "Edit Doctor" : "Create Doctor"}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Degree *"
            value={form.degree}
            onChange={(e) => setForm({ ...form, degree: e.target.value })}
            required
          />
          <Input
            label="Display Name *"
            value={form.descName}
            onChange={(e) => setForm({ ...form, descName: e.target.value })}
            placeholder="e.g. DR.John MBBS (Duty Dr)"
            required
          />
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-600">Active</label>
            <button
              type="button"
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isActive ? "bg-indigo-500" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isActive ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingDoctor ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
