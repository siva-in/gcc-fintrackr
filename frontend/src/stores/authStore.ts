import { create } from "zustand";
import api from "@/lib/api";
import type { User, Organization } from "@/lib/types";

interface OrgMembership {
  organization: Organization;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  userLevel: "COMPANY" | "ORG" | null;
  orgId: number | null;
  orgRole: string | null;
  orgMemberships: OrgMembership[];
  companyRoles: string[];
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  setOrg: (orgId: number) => void;
  hydrateFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  userLevel: null,
  orgId: null,
  orgRole: null,
  orgMemberships: [],
  companyRoles: [],
  isLoading: true,

  login: async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    localStorage.setItem("token", data.token);
    set({ token: data.token });
    await get().fetchMe();
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("orgId");
    set({ user: null, token: null, userLevel: null, orgId: null, orgRole: null, orgMemberships: [], companyRoles: [], isLoading: false });
  },

  hydrateFromStorage: () => {
    const token = localStorage.getItem("token");
    const orgId = Number(localStorage.getItem("orgId")) || null;
    set({ token, orgId, isLoading: false });
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get("/auth/me");

      const orgMems: OrgMembership[] = (data.orgUsers || []).map((ou: { role: string; organization: Organization }) => ({
        organization: ou.organization,
        role: ou.role,
      }));

      const companyRoles: string[] = (data.companyUsers || []).map((cu: { role: string }) => cu.role);

      set({
        user: data,
        userLevel: data.userLevel,
        orgMemberships: orgMems,
        companyRoles,
        isLoading: false,
      });

      // If user is ORG level, auto-select an org
      if (data.userLevel === "ORG") {
        const currentOrgId = get().orgId;
        if (currentOrgId) {
          const match = orgMems.find((m) => m.organization.id === currentOrgId);
          if (match) {
            set({ orgRole: match.role });
          } else if (orgMems.length > 0) {
            const first = orgMems[0];
            localStorage.setItem("orgId", String(first.organization.id));
            set({ orgId: first.organization.id, orgRole: first.role });
          }
        } else if (orgMems.length > 0) {
          const first = orgMems[0];
          localStorage.setItem("orgId", String(first.organization.id));
          set({ orgId: first.organization.id, orgRole: first.role });
        }
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setOrg: (orgId) => {
    localStorage.setItem("orgId", String(orgId));
    const org = get().orgMemberships.find((m) => m.organization.id === orgId);
    set({ orgId, orgRole: org?.role || null });
  },
}));
