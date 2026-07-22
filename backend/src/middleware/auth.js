const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, firstName: true, lastName: true, status: true, userLevel: true },
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Get all role names for a given user
async function getUserRoleNames(userId) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
  return userRoles.map((ur) => ur.role.name);
}

// Check if user has a specific role
async function userHasRole(userId, roleName) {
  const count = await prisma.userRole.count({
    where: {
      userId,
      role: { name: roleName },
    },
  });
  return count > 0;
}

// Get user's company role names
async function getUserCompanyRoleNames(userId) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, role: { type: "COMPANY" } },
    include: { role: true },
  });
  return userRoles.map((ur) => ur.role.name);
}

// Get user's org role names (for a specific org)
async function getUserOrgRoleNames(userId, orgId) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, role: { type: "ORG", orgId } },
    include: { role: true },
  });
  return userRoles.map((ur) => ur.role.name);
}

const requireCompanyRole = (...roles) => {
  return async (req, res, next) => {
    const userRoles = await getUserCompanyRoleNames(req.user.id);

    if (userRoles.length === 0) {
      return res.status(403).json({ message: "User has no company roles" });
    }

    if (roles.length > 0 && !roles.some((r) => userRoles.includes(r))) {
      return res.status(403).json({
        message: `Requires one of: ${roles.join(", ")}. Your company roles: ${userRoles.join(", ")}`,
      });
    }

    req.userCompanyRoles = userRoles;
    next();
  };
};

const requireOrg = async (req, res, next) => {
  try {
    const orgId = parseInt(req.headers["x-org-id"]);
    if (!orgId) {
      return res.status(400).json({ message: "Organization ID required (x-org-id header)" });
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    if (req.user.userLevel === "COMPANY") {
      req.orgId = orgId;
      req.userOrgRoles = [];
      req.orgUser = null;
      return next();
    }

    const userRoles = await getUserOrgRoleNames(req.user.id, orgId);
    if (userRoles.length === 0) {
      return res.status(403).json({ message: "Not a member of this organization" });
    }

    req.orgId = orgId;
    req.userOrgRoles = userRoles;
    req.orgUser = { roleNames: userRoles };
    next();
  } catch (error) {
    return res.status(500).json({ message: "Error verifying organization membership" });
  }
};

const requireOrgRole = (...roles) => {
  return (req, res, next) => {
    if (req.user.userLevel === "COMPANY") {
      return next();
    }
    if (!req.userOrgRoles || !roles.some((r) => req.userOrgRoles.includes(r))) {
      return res.status(403).json({
        message: `Requires one of: ${roles.join(", ")}. Your org roles: ${req.userOrgRoles?.join(", ") || "none"}`,
      });
    }
    next();
  };
};

module.exports = { authenticate, requireCompanyRole, requireOrg, requireOrgRole, getUserRoleNames, userHasRole, getUserCompanyRoleNames, getUserOrgRoleNames, prisma };
