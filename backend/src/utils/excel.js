const readXlsxFile = require("read-excel-file/node");
const fs = require("fs/promises");

const normalizeCellValue = (value, defval = null) => (value == null ? defval : value);

const unwrapRows = (parsed) => {
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid Excel content: expected rows array");
  }

  if (parsed.length === 0) {
    return [];
  }

  if (Array.isArray(parsed[0])) {
    return parsed;
  }

  const firstEntry = parsed[0];
  if (firstEntry && Array.isArray(firstEntry.data)) {
    return firstEntry.data;
  }

  throw new Error("Invalid Excel content: unsupported row structure");
};

const normalizeRows = (parsedRows, defval) =>
  unwrapRows(parsedRows).map((row) => row.map((cell) => normalizeCellValue(cell, defval)));

const readFirstSheetRowsFromBuffer = async (buffer, { defval = null } = {}) => {
  const rows = await readXlsxFile(buffer);
  return normalizeRows(rows, defval);
};

const readFirstSheetRowsFromFile = async (filePath, { defval = null } = {}) => {
  const file = await fs.readFile(filePath);
  const rows = await readXlsxFile(file);
  return normalizeRows(rows, defval);
};

const rowsToObjects = (rows) => {
  if (!rows || rows.length === 0) return [];
  const headers = (rows[0] || []).map((h) => String(h || "").trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c != null && String(c).trim() !== ""));

  return dataRows.map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    return obj;
  });
};

module.exports = {
  readFirstSheetRowsFromBuffer,
  readFirstSheetRowsFromFile,
  rowsToObjects,
};
