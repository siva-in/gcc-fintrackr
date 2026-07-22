export interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  mobile: string;
  status: "ACTIVE" | "INACTIVE";
  userLevel: "COMPANY" | "ORG";
  createdAt?: string;
  updatedAt?: string;
  userRoles?: UserRole[];
  _count?: { userRoles: number };
}

export interface Company {
  id: number;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  companyUsers?: { id: number; userId: number; role: string; user: User }[];
  _count?: { companyUsers: number };
}

export interface Organization {
  id: number;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
  updatedAt?: string;
  orgUsers?: { id: number; userId: number; role: string; user: User }[];
  _count?: { orgUsers: number; requests: number };
}

export interface Role {
  id: number;
  name: string;
  type: "COMPANY" | "ORG";
  orgId?: number | null;
}

export interface UserRole {
  id: number;
  userId: number;
  roleId: number;
  role: Role;
  organization?: Organization;
}

export interface Request {
  id: number;
  orgId: number;
  title: string;
  description?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdBy: number;
  createdAt: string;
  creator?: User;
  approvals?: Approval[];
  organization?: Organization;
}

export interface Approval {
  id: number;
  requestId: number;
  approverId: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  comment?: string;
  approver?: User;
  request?: Request;
  createdAt: string;
}

export interface RoleAssignment {
  id: number;
  userId: number;
  roleId: number;
  user: User;
  role: Role & { org: { id: number; name: string } | null };
}

export interface PaginatedResponse {
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
