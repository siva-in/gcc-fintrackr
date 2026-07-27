const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const COMPANY_ROLES = ["ADMIN", "VIEWER", "EDITOR", "APPROVER"];
const ORG_ROLES = ["MANAGER", "ACCOUNTANT", "LEADER", "HR", "USER"];

const INCOME_SOURCES = [
  { code: "IP", name: "In Patient" },
  { code: "OP", name: "Out Patient" },
  { code: "LAB", name: "Laboratory" },
  { code: "PHARMACY", name: "Pharmacy" },
  { code: "MISC", name: "Miscellaneous" },
];

const PAYMENT_MODES = [
  { code: "CASH", name: "Cash" },
  { code: "BANK", name: "Bank Transfer" },
  { code: "UPI", name: "UPI" },
  { code: "CARD", name: "Card" },
  { code: "CHEQUE", name: "Cheque" },
  { code: "CREDIT", name: "Credit" },
  { code: "INSURANCE", name: "Insurance" },
];

const INSURANCE_BIZ_PARTNERS = [
  "Niva Bupa Health",
  "Aditya Birla Health",
  "Bajaj Allianz",
  "National Insurance",
  "CMScheme",
  "PMScheme",
];

async function seedIncomeSources(runner) {
  for (const { code, name } of INCOME_SOURCES) {
    const existing = await runner.incomeSource.findFirst({ where: { code } });
    if (!existing) {
      await runner.incomeSource.create({ data: { code, name } });
    }
  }
}

async function seedPaymentModes(runner) {
  for (const { code, name } of PAYMENT_MODES) {
    const existing = await runner.paymentMode.findFirst({ where: { code } });
    if (!existing) {
      await runner.paymentMode.create({ data: { code, name } });
    }
  }
}

async function seedInsuranceBizPartners(runner) {
  for (const bpName of INSURANCE_BIZ_PARTNERS) {
    const existing = await runner.bizPartner.findFirst({
      where: { bpType: "INSURANCE", bpName },
    });
    if (!existing) {
      await runner.bizPartner.create({
        data: {
          bpType: "INSURANCE",
          bpName,
          isActive: true,
        },
      });
    }
  }
}

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
  name = "admin";
  const existingAdmin = await prisma.user.findUnique({
    where: { username: name },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("a", 12);

    const admin = await prisma.user.create({
      data: {
        username: name,
        password: hashedPassword,
        firstName: "Siva",
        lastName: "R",
        mobile: "8807733633",
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
  await seedIncomeSources(prisma);
  await seedPaymentModes(prisma);
  await seedInsuranceBizPartners(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
