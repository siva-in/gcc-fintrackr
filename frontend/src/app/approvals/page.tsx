"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Approval } from "@/lib/types";
import { useAuthStore } from "@/stores/authStore";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import { CheckCircle, XCircle, Clock, FileText } from "lucide-react";

export default function ApprovalsPage() {
  const { orgId, orgRole } = useAuthStore();
  const [approvals, setApprovals] = useState<
    (Approval & {
      request: {
        id: number;
        title: string;
        description?: string;
        creator: { firstName: string; lastName: string };
      };
    })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  const fetchApprovals = async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/requests/my-approvals");
      setApprovals(data);
    } catch {
      toast.error("Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [orgId]);

  const handleApprove = async (requestId: number, status: "APPROVED" | "REJECTED") => {
    setActing(requestId);
    try {
      await api.post(`/requests/${requestId}/approve`, { status });
      toast.success(status === "APPROVED" ? "Request approved" : "Request rejected");
      fetchApprovals();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Action failed";
      toast.error(msg);
    } finally {
      setActing(null);
    }
  };

  const canApprove = orgRole === "LEADER";

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Pending Approvals</h1>
        <p className="text-slate-400 text-sm mt-1">Review and approve/reject requests</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            Loading...
          </div>
        </div>
      ) : approvals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock size={32} className="text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-600">No pending approvals</h3>
          <p className="text-slate-400 text-sm mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="bg-white rounded-2xl border border-slate-200/60 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-200"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={20} className="text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 text-lg">
                        {approval.request.title}
                      </h3>
                      {approval.request.description && (
                        <p className="text-sm text-slate-500 mt-1">
                          {approval.request.description}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-2">
                        Submitted by{" "}
                        <span className="font-medium text-slate-500">
                          {approval.request.creator.firstName} {approval.request.creator.lastName}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                {canApprove && (
                  <div className="flex gap-2 shrink-0 sm:ml-4">
                    <Button
                      variant="success"
                      size="sm"
                      isLoading={acting === approval.requestId}
                      onClick={() => handleApprove(approval.requestId, "APPROVED")}
                    >
                      <CheckCircle size={16} className="mr-1" /> Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      isLoading={acting === approval.requestId}
                      onClick={() => handleApprove(approval.requestId, "REJECTED")}
                    >
                      <XCircle size={16} className="mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
