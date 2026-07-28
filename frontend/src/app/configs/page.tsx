"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface ConfigMaster {
  id: number;
  category: string;
  code: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = ["IP_FILTER"];

export default function ConfigsPage() {
  const [configs, setConfigs] = useState<ConfigMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigMaster | null>(null);
  const [form, setForm] = useState({ category: "IP_FILTER", code: "", value: "" });
  const [saving, setSaving] = useState(false);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/config");
      setConfigs(data || []);
    } catch {
      toast.error("Failed to load configs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ category: "IP_FILTER", code: "", value: "" });
    setModalOpen(true);
  };

  const openEdit = (cfg: ConfigMaster) => {
    setEditing(cfg);
    setForm({ category: cfg.category, code: cfg.code, value: cfg.value });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.value.trim()) {
      toast.error("Code and value are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/config/${editing.id}`, { code: form.code.trim(), value: form.value.trim() });
        toast.success("Config updated");
      } else {
        await api.post("/config", { category: form.category, code: form.code.trim(), value: form.value.trim() });
        toast.success("Config created");
      }
      setModalOpen(false);
      fetchConfigs();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this configuration?")) return;
    try {
      await api.delete(`/config/${id}`);
      toast.success("Config deleted");
      fetchConfigs();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Config Master</h1>
          <p className="text-slate-400 text-sm mt-1">Manage system configuration values</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} className="mr-1" /> Add Config
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-20 text-slate-400">No configurations found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Value</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {configs.map((cfg) => (
                  <tr key={cfg.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs font-medium bg-indigo-50 text-indigo-600 rounded-md">
                        {cfg.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{cfg.code}</td>
                    <td className="px-4 py-3 text-slate-600">{cfg.value}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(cfg)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(cfg.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Config" : "Add Config"}>
        <form onSubmit={handleSave} className="space-y-4">
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. DOCTOR CONSULTATION"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
            <input
              type="text"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="e.g. DOCTOR, VENDOR"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editing ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
