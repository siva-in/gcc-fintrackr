"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import type { Organization, User } from "@/lib/types";
import { useAuthStore } from "@/stores/authStore";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, Shield } from "lucide-react";
import Link from "next/link";

const ORG_ROLES: { value: string; label: string }[] = [
  { value: "MANAGER", label: "Manager" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "LEADER", label: "Leader" },
  { value: "HR", label: "HR" },
  { value: "USER", label: "User" },
];

const roleColors: Record<string, string> = {
  MANAGER: "bg-red-50 text-red-700 ring-red-600/20",
  ACCOUNTANT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  LEADER: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  HR: "bg-purple-50 text-purple-700 ring-purple-600/20",
  USER: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export default function OrgDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userLevel } = useAuthStore();
  const orgId = params.id as string;
  const [org, setOrg] = useState<Organization & { orgUsers: { id: number; role: string; user: User }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("USER");
  const [assigning, setAssigning] = useState(false);

  const fetchOrg = async () => {
    try {
      const { data } = await api.get(`/organizations/${orgId}`);
      setOrg(data);
    } catch {
      toast.error("Failed to load organization");
      router.push("/organizations");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const { data } = await api.get("/users?limit=100");
      setAllUsers(data.users);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => { fetchOrg(); fetchAllUsers(); }, [orgId]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssigning(true);
    try {
      await api.post(`/organizations/${orgId}/users`, { userId: parseInt(selectedUserId), role: selectedRole });
      toast.success("User assigned successfully");
      setAssignModalOpen(false);
      setSelectedUserId("");
      setSelectedRole("USER");
      fetchOrg();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to assign user";
      toast.error(msg);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (userId: number) => {
    if (!confirm("Remove user from this organization?")) return;
    try {
      await api.delete(`/organizations/${orgId}/users/${userId}`);
      toast.success("User removed");
      fetchOrg();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to remove user";
      toast.error(msg);
    }
  };

  const canEdit = userLevel === "COMPANY";

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12 text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            Loading...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!org) return null;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <Link href="/organizations" className="inline-flex items-center text-sm text-slate-400 hover:text-indigo-500 mb-3 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back to Organizations
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{org.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant={org.status === "ACTIVE" ? "success" : "danger"}>{org.status}</Badge>
              <span className="text-sm text-slate-400">{org.orgUsers?.length || 0} members</span>
            </div>
          </div>
          {canEdit && (
            <Button onClick={() => setAssignModalOpen(true)}>
              <Plus size={16} className="mr-2" /> Assign Member
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/60 bg-slate-50/50">
          <h2 className="font-bold text-slate-700 flex items-center gap-2">
            <Shield size={18} className="text-indigo-500" /> Members & Roles
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">User</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Username</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Mobile</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Role</th>
                {canEdit && <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!org.orgUsers || org.orgUsers.length === 0) ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400">No members</td></tr>
              ) : (
                org.orgUsers.map((ou) => ou.user && (
                  <tr key={ou.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{ou.user.firstName} {ou.user.lastName}</td>
                    <td className="px-5 py-3.5 text-slate-500">{ou.user.username}</td>
                    <td className="px-5 py-3.5 text-slate-500">{ou.user.mobile}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${roleColors[ou.role] || ""}`}>
                        {ou.role}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => ou.user && handleRemove(ou.user.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
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

      <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="Assign Member">
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">User</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              required
            >
              <option value="">Select a user</option>
              {allUsers.filter((u) => u.userLevel === "ORG").filter((u) => !org.orgUsers?.some((ou) => ou.user?.id === u.id)).map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.username})</option>
              ))}
            </select>
          </div>
          <Select
            label="Role"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            options={ORG_ROLES}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={assigning}>Assign</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
