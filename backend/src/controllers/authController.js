const { body, validationResult } = require("express-validator");
const { comparePassword, generateToken } = require("../utils/helpers");
const { prisma } = require("../middleware/auth");

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true, username: true, password: true, userLevel: true, status: true },
    });

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (user.status !== "ACTIVE") return res.status(403).json({ message: "Account is inactive" });

    const valid = await comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user.id);

    res.json({
      token,
      user: { id: user.id, username: user.username, userLevel: user.userLevel },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        mobile: true,
        status: true,
        userLevel: true,
        userRoles: {
          include: {
            role: {
              include: { org: { select: { id: true, name: true, status: true } } },
            },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const companyRoles = user.userRoles.filter((ur) => ur.role.type === "COMPANY").map((ur) => ({
      id: ur.id,
      roleId: ur.roleId,
      roleName: ur.role.name,
    }));

    const orgRoles = user.userRoles.filter((ur) => ur.role.type === "ORG").map((ur) => ({
      id: ur.id,
      roleId: ur.roleId,
      roleName: ur.role.name,
      organization: ur.role.org,
    }));

    // For backward compatibility with the frontend
    const orgUsers = orgRoles.map((r) => ({
      id: r.id,
      role: r.roleName,
      organization: r.organization,
    }));

    const companyUsers = companyRoles.map((r) => ({
      id: r.id,
      role: r.roleName,
    }));

    // Also include company info if user has company roles
    let company = null;
    if (companyRoles.length > 0) {
      const cu = await prisma.company.findFirst();
      if (cu) {
        company = { id: cu.id, name: cu.name };
        companyUsers.forEach(cu => cu.company = company);
      }
    }

    res.json({
      ...user,
      companyUsers,
      orgUsers,
    });
  } catch (error) {
    console.error("GetMe error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { login, getMe };
module.exports.validation = {
  login: [
    body("username").notEmpty().withMessage("Username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
};
