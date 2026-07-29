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
  { code: "ADV", name: "Advance" },
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
  "NK48",
  "CMCHIS",
  "NHIS",
  "Medi Assist",
  "Bajaj Allianz General Insurance",
  "Chola MS General Insurance",
  "Ericsson TPA",
  "FHPL (Family Health Plan Insurance TPA Ltd.)",
  "Galaxy Health Insurance",
  "Go Digit General Insurance",
  "Link-K TPA",
  "Niva Bupa Health Insurance",
  "Reliance General Insurance",
  "SBI General Insurance",
  "Vidal Health TPA",
  "Volo Health Insurance TPA",
];

const VENDOR_BIZ_PARTNERS = [{ bpName: "Siva Neuro Diagnostics", mobile: "8883069610" }];

const IP_FILTER_CONFIGS = [
  { code: "DR.", value: "DOCTOR" },
  { code: "SURGEON FEE", value: "DOCTOR" },
  { code: "ANESTHESIOLOGY TEAM CHARGES", value: "DOCTOR" },
  { code: "ASSISTANT SURGEON CHARGES - 1", value: "DOCTOR" },
  { code: "CONSULTATION CHARGES", value: "DOCTOR" },
  { code: "DOCTOR CONSULTATION SPECIALITY", value: "DOCTOR" },
  { code: "CARDIOLOGIST  CONSULTATION", value: "DOCTOR" },
  { code: "COUNSELLING", value: "DOCTOR" },
  { code: "SLEEP STUDY", value: "VENDOR" },
  { code: "DMO", value: "DOCTOR" },
  { code: "EEG", value: "VENDOR" },
  { code: "Implant", value: "DOCTOR, VENDOR" },
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

async function seedVendorBizPartners(runner) {
  for (const v of VENDOR_BIZ_PARTNERS) {
    const existing = await runner.bizPartner.findFirst({
      where: { bpType: "VENDOR", bpName: v.bpName },
    });
    if (!existing) {
      await runner.bizPartner.create({
        data: {
          bpType: "VENDOR",
          bpName: v.bpName,
          mobile: v.mobile || null,
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

async function seedConfigMaster(runner) {
  for (const { code, value } of IP_FILTER_CONFIGS) {
    const existing = await runner.configMaster.findFirst({
      where: { category: "IP_FILTER", code },
    });
    if (!existing) {
      await runner.configMaster.create({
        data: { category: "IP_FILTER", code, value },
      });
    }
  }
}

async function main() {
  const name = "siva";
  const existingAdmin = await prisma.user.findUnique({
    where: { username: name },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("s", 12);

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
  await seedVendorBizPartners(prisma);
  await seedConfigMaster(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
