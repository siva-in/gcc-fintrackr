"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Request } from "@/lib/types";
import { useAuthStore } from "@/stores/authStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus, Eye } from "lucide-react";

export default function RequestsPage() {
  const { orgRole, orgId } = useAuthStore();
  const [requests, setRequests] = useState<Request[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Request | null>(null);
  const [form, setForm] = useState({ title: "", description: "" });
  const [saving, setSaving] = useState(false);

  const fetchRequests = async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/requests?page=${page}&status=${statusFilter}&limit=10`);
      setRequests(data.requests);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [page, statusFilter, orgId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/requests", form);
      toast.success("Request created. Approval notifications sent.");
      setModalOpen(false);
      setForm({ title: "", description: "" });
      fetchRequests();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create request";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const canCreate = orgRole === "MANAGER" || orgRole === "LEADER";

  const statusColors: Record<string, "success" | "warning" | "danger"> = {
    PENDING: "warning",
    APPROVED: "success",
    REJECTED: "danger",
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Requests</h1>
          <p className="text-slate-400 text-sm mt-1">Manage approval requests</p>
        </div>
        {canCreate && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} className="mr-2" /> New Request
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {["", "PENDING", "APPROVED", "REJECTED"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 text-sm rounded-xl font-medium transition-all ${
                statusFilter === s
                  ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Title</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Created By</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Approvals</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Date</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    <span className="text-sm text-slate-400 font-medium">Loading requests...</span>
                  </div>
                </td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">No requests found</td></tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{req.title}</td>
                    <td className="px-5 py-3.5 text-slate-500">{req.creator?.firstName} {req.creator?.lastName}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={statusColors[req.status] || "info"}>{req.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {req.approvals?.filter((a) => a.status === "APPROVED").length || 0}/
                      {req.approvals?.length || 0} approved
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 text-xs">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={() => setDetailModal(req)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                        <Eye size={16} />
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
                <button key={p} onClick={() => setPage(p)} className={`px-3.5 py-1.5 text-sm rounded-lg font-medium transition-all ${p === page ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Request">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>Submit Request</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title="Request Details">
        {detailModal && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-slate-800 text-lg">{detailModal.title}</h3>
              {detailModal.description && <p className="text-sm text-slate-500 mt-1">{detailModal.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Status:</span>
              <Badge variant={statusColors[detailModal.status] || "info"}>{detailModal.status}</Badge>
            </div>
            <div className="text-sm text-slate-400">
              Created by {detailModal.creator?.firstName} {detailModal.creator?.lastName} on {new Date(detailModal.createdAt).toLocaleString()}
            </div>
            {detailModal.approvals && detailModal.approvals.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-700 mb-2">Approval Votes</h4>
                <div className="space-y-2">
                  {detailModal.approvals.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm font-medium text-slate-700">{a.approver?.firstName} {a.approver?.lastName}</span>
                      <div className="flex items-center gap-2">
                        {a.comment && <span className="text-xs text-slate-400">{a.comment}</span>}
                        <Badge variant={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : "warning"}>
                          {a.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
