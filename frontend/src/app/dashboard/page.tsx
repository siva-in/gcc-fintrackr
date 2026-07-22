"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuthStore } from "@/stores/authStore";
import { Users, Building2, FileText, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import api from "@/lib/api";

interface Stats {
  users: number;
  organizations: number;
  requests: number;
  pendingApprovals: number;
}

export default function DashboardPage() {
  const { orgId } = useAuthStore();
  const [stats, setStats] = useState<Stats>({ users: 0, organizations: 0, requests: 0, pendingApprovals: 0 });

  useEffect(() => {
    if (!orgId) return;
    async function load() {
      try {
        const [usersRes, orgsRes, reqsRes, approvalsRes] = await Promise.all([
          api.get("/users?limit=1"),
          api.get("/organizations?limit=1"),
          api.get("/requests?limit=1"),
          api.get("/requests/my-approvals"),
        ]);
        setStats({
          users: usersRes.data.pagination.total,
          organizations: orgsRes.data.pagination.total,
          requests: reqsRes.data.pagination.total,
          pendingApprovals: approvalsRes.data.length,
        });
      } catch {
        // Stats loading error - non-critical
      }
    }
    load();
  }, [orgId]);

  const cards = [
    {
      label: "Total Users",
      value: stats.users,
      icon: Users,
      gradient: "from-blue-500 to-cyan-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Organizations",
      value: stats.organizations,
      icon: Building2,
      gradient: "from-emerald-500 to-teal-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Requests",
      value: stats.requests,
      icon: FileText,
      gradient: "from-violet-500 to-purple-400",
      bg: "bg-violet-500/10",
    },
    {
      label: "Pending Approvals",
      value: stats.pendingApprovals,
      icon: CheckCircle,
      gradient: "from-amber-500 to-orange-400",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Welcome back to FinTrackr</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5 transition-all duration-200"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">{card.label}</p>
                  <p className="text-3xl font-bold text-slate-800 mt-2">{card.value}</p>
                </div>
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${card.gradient} shadow-lg`}
                  style={{
                    boxShadow: `0 8px 16px -4px rgba(0,0,0,0.1)`,
                  }}
                >
                  <Icon size={26} className="text-white" strokeWidth={2} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
