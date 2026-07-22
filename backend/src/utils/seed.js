const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const COMPANY_ROLES = ["ADMIN", "VIEWER", "EDITOR", "APPROVER"];
const ORG_ROLES = ["MANAGER", "ACCOUNTANT", "LEADER", "HR", "USER"];

async function createCompanyRoles(runner) {
  for (const name of COMPANY_ROLES) {
    const existing = await runner.role.findFirst({ where: { name, type: "COMPANY", orgId: null } });
    if (!existing) {
      await runner.role.create({ data: { name, type: "COMPANY" } });
    }
  }
}

async function createOrgRoles(runner) {
  const orgs = await runner.organization.findMany();
  for (const org of orgs) {
    for (const name of ORG_ROLES) {
      const existing = await runner.role.findFirst({ where: { name, type: "ORG", orgId: org.id } });
      if (!existing) {
        await runner.role.create({ data: { name, type: "ORG", orgId: org.id } });
      }
    }
  }
}

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("1", 12);

    const admin = await prisma.user.create({
      data: {
        username: "admin",
        password: hashedPassword,
        firstName: "System",
        lastName: "Administrator",
        mobile: "1234567890",
        status: "ACTIVE",
        userLevel: "COMPANY",
      },
    });

    const company = await prisma.company.create({
      data: { name: "Default Company" },
    });

    await createCompanyRoles(prisma);

    const adminRole = await prisma.role.findFirst({ where: { name: "ADMIN", type: "COMPANY" } });
    if (adminRole) {
      await prisma.userRole.create({
        data: { userId: admin.id, roleId: adminRole.id },
      });
    }

    console.log("Default Company, admin user, and company roles created");
  } else {
    console.log("Admin user already exists, ensuring roles exist...");
    await createCompanyRoles(prisma);
  }

  await createOrgRoles(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
