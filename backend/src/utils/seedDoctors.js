const { PrismaClient } = require("@prisma/client");
const path = require("path");
const { readFirstSheetRowsFromFile, rowsToObjects } = require("./excel");

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(__dirname, "../../prisma/doctors.xlsx");

  const rawRows = await readFirstSheetRowsFromFile(filePath);
  const rows = rowsToObjects(rawRows);

  if (rows.length === 0) {
    console.log("No rows found in doctors.xlsx");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row["Name"]?.toString().trim();
    const degree = row["Degree"]?.toString().trim();
    const descName = (row["Name_Descr"] || row["Name_Desc"])?.toString().trim();

    if (!name || !degree || !descName) {
      skipped++;
      continue;
    }

    const existing = await prisma.doctor.findFirst({ where: { name, degree } });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.doctor.create({
      data: { name, degree, descName, isActive: true },
    });
    created++;
  }

  console.log(`Doctors seeded: ${created} created, ${skipped} skipped`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
