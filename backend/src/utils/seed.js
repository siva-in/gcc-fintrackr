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
  { code: "COMPANY", name: "Company" },
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

const DOCTORS_CSV = `Name,Degree,Name_Descr
"DR. RAMANATHAN","MBBS.,DA.,MD(INTENSIVIST)","DR. RAMANATHAN MBBS.,DA.,MD(INTENSIVIST)"
"DR. POONGUZHALI","MBBS.,MS(O&G)","DR. POONGUZHALI MBBS.,MS(O&G)"
"DR. SIVAKUMAR","MBBS.,MS(ORTHO)","DR. SIVAKUMAR MBBS.,MS(ORTHO)"
"DR. GOWRI","MBBS.,MD","DR. GOWRI MBBS.,MD"
"DR. SAKTHI KUMAR","MBBS.,MD","DR. SAKTHI KUMAR MBBS.,MD"
"DR. RAMUGUNASEKAR","MBBS.,DM(Cardiologist)","DR. RAMUGUNASEKAR MBBS.,DM(Cardiologist)"
"DR. GOWTHAM","MBBS.,(Neuro)","DR. GOWTHAM MBBS.,(Neuro)"
"DR. POORNALINGAM","MBBS.,MS (ORTHO)","DR. POORNALINGAM MBBS.,MS (ORTHO)"
"DR. BALAMURUGAN","MBBS.,MS.,Mch (Neurosurgeon)","Dr. BALAMURUGAN MBBS.,MS.,Mch (Neurosurgeon)"
"DR. SUKUMAR","MBBS.,MGE","DR. SUKUMAR MBBS.,MGE"
"DR. PRIYA","MBBS.,MS(OPHTHALMOLOGIST)","DR. PRIYA MBBS.,MS(OPHTHALMOLOGIST)"
"DR. KAVERI","MBBS.,MS(Neuro)","DR. KAVERI MBBS.,MS(Neuro)"
"DR. SADHANA","MBBS.,MS (GENERAL SURGEON)","DR. SADHANA MBBS.,MS (GENERAL SURGEON)"
"DR. SUGUMARAN","MBBS.,MGE","DR. SUGUMARAN MBBS.,MGE"
"DR. SRIVIDHYA","MBBS.,MD(PSYCHIATRIST)","DR. SRIVIDHYA MBBS.,MD(PSYCHIATRIST)"
"DR. RAM MOHAN","MBBS.,MS(OMFS)","DR. RAM MOHAN MBBS.,MS(OMFS)"
"DR. CHANDRA SEKAR","MBBS.,MS(ENT)","DR. CHANDRA SEKAR MBBS.,MS(ENT)"
"DR. S. GOPIKUMAR","MBBS.,DCH.,MD.,DM.,DrNB (Nephrology)","DR. S. GOPIKUMAR MBBS.,DCH.,MD.,DM.,DrNB (Nephrology)"
"DR. PRAKASH","MBBS.,MS (GEN SURGEON)","DR. PRAKASH MBBS.,MS (GEN SURGEON)"
"DR. VEERAMANI","MBBS.,MD.,MD.,DM (CARDIOLOGIST)","DR. VEERAMANI MBBS.,MD.,MD.,DM (CARDIOLOGIST)"
"DR. BALAMURUGAN","MBBS.,MD(Neuro Physician)","DR. BALAMURUGAN MBBS.,MD(Neuro Physician)"
"DR. SATHYA","MBBS.,MD(Pediatrician)","DR. SATHYA MBBS.,MD(Pediatrician)"
"DR. NANDHA KUMAR","BDS(Dental)","DR. NANDHA KUMAR BDS(Dental)"
"DR. GANESAN","MBBS.,MS(GEN SURGEON)","DR. GANESAN MBBS.,MS(GEN SURGEON)"
"DR. SRINIVASAN","MBBS.,MS.,Mch","DR. SRINIVASAN MBBS.,MS.,Mch"
"DR.VINOTH","MBBS.,MD.,DM(Rheumatology)","DR.VINOTH.,MBBS.,MD.,DM(Rheumatology)"
"DR. VELMURUGAN","MBBS.,MD(Pedia)","DR. VELMURUGAN MBBS.,MD(Pedia)"
"DR. KALAIYARASAN","MBBS.,MS (General Surgeon)","DR. KALAIYARASAN MBBS.,MS (General Surgeon)"
"DR. KRISHNA KUMAR","MBBS.,MS(ORTHO)","DR. KRISHNA KUMAR"
"DR. SOWMIYA","MBBS.,MD(Pediatrician)","DR. SOWMIYA MBBS.,MD(Pediatrician)"
"DR. VELMURUGAN","MBBS.,MD.,DM (MGE)","DR. VELMURUGAN MBBS.,MD.,DM (MGE)"
"DR. KANYA","MBBS.,MD(IHBT)","DR. KANYA MBBS.,MD(IHBT)"
"DR. JAYAPRAKASH","MBBS.,MS.,Mch (Urologist)","DR. JAYAPRAKASH MBBS.,MS.,Mch (Urologist)"
"DR. PRITHIV RAJ","MBBS.,MS(PLASTIC SURGEON)","DR. PRITHIV RAJ MBBS.,MS(PLASTIC SURGEON)"
"DR. ARUN","MBBS.,MD (PULMONOLOGIST)","DR. ARUN MBBS.,MD (PULMONOLOGIST)"
"DR. RAJAMANI","MBBS.,MS(O&G)","DR. RAJAMANI MBBS.,MS(O&G)"
"DR. GEETHA","MBBS.,MD(OPHTHALMOLOGIST)","DR. GEETHA MBBS.,MD(OPHTHALMOLOGIST)"
"DR. VINOJ","MBBS.,DM(Nephro)","DR. VINOJ MBBS.,DM(Nephro)"
"DR. SIVA SUBRAMANIYAM","MBBS.,MD(DERMATOLOGIST)","DR. SIVA SUBRAMANIYAM.,MBBS.,MD(DERMATOLOGIST)"
"Dr. MOHAN RAJ","MBBS.,MD (Pediatrics)","Dr. MOHAN RAJ MBBS.,MD (Pediatrics)"
"DR. NANDHINI","MBBS.,MD (PEDIATRICIAN)","DR. NANDHINI MBBS.,MD (PEDIATRICIAN)"
"DR. THIRUMANIKANDAN","MBBS.,MS.,DrNB (SURGICAL ONCOLOGIST)","DR. THIRUMANIKANDAN MBBS.,MS.,DrNB (SURGICAL ONCOLOGIST)"`;

const parseCsv = (csv) => {
  const rows = [];
  const lines = csv.trim().split("\n");
  for (const line of lines) {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
};

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
  { code: "IMPLANT", value: "DOCTOR, VENDOR" },
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

async function seedUnknownBizPartner(runner) {
  const existing = await runner.bizPartner.findFirst({
    where: { bpName: "UNKNOWN" },
  });
  if (!existing) {
    await runner.bizPartner.create({
      data: {
        bpType: "OTHER",
        bpName: "UNKNOWN",
        isActive: true,
      },
    });
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

async function seedDoctors(runner) {
  const rows = parseCsv(DOCTORS_CSV);
  const [header, ...dataRows] = rows;
  const nameIdx = header.findIndex((h) => h.trim().toLowerCase() === "name");
  const degreeIdx = header.findIndex((h) => h.trim().toLowerCase() === "degree");
  const descIdx = header.findIndex((h) => h.trim().toLowerCase() === "name_descr");

  let created = 0;
  let skipped = 0;

  for (const row of dataRows) {
    if (!row[nameIdx] || !row[degreeIdx] || !row[descIdx]) {
      skipped++;
      continue;
    }
    const name = row[nameIdx].trim();
    const degree = row[degreeIdx].trim();
    const descName = row[descIdx].trim();

    const existing = await runner.doctor.findFirst({ where: { name, degree } });
    if (existing) {
      skipped++;
      continue;
    }

    await runner.doctor.create({
      data: { name, degree, descName, isActive: true },
    });
    created++;
  }

  console.log(`Doctors seeded: ${created} created, ${skipped} skipped`);
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
  await seedUnknownBizPartner(prisma);
  await seedConfigMaster(prisma);
  await seedDoctors(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
