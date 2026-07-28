const { prisma } = require("../middleware/auth");

const getConfigByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const configs = await prisma.configMaster.findMany({
      where: { category },
      orderBy: { code: "asc" },
    });
    res.json(configs);
  } catch (error) {
    console.error("GetConfigByCategory error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllConfigs = async (req, res) => {
  try {
    const configs = await prisma.configMaster.findMany({
      orderBy: [{ category: "asc" }, { code: "asc" }],
    });
    res.json(configs);
  } catch (error) {
    console.error("GetAllConfigs error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const createConfig = async (req, res) => {
  try {
    const { category, code, value } = req.body;
    if (!category || !code || !value) return res.status(400).json({ message: "category, code, and value are required" });

    const existing = await prisma.configMaster.findFirst({
      where: { category, code },
    });
    if (existing) return res.status(409).json({ message: `Config '${code}' already exists in ${category}` });

    const config = await prisma.configMaster.create({
      data: { category, code, value },
    });
    res.status(201).json(config);
  } catch (error) {
    console.error("CreateConfig error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, value } = req.body;

    const existing = await prisma.configMaster.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ message: "Config not found" });

    if (code && code !== existing.code) {
      const duplicate = await prisma.configMaster.findFirst({
        where: { category: existing.category, code, id: { not: parseInt(id) } },
      });
      if (duplicate) return res.status(409).json({ message: `Code '${code}' already exists` });
    }

    const updated = await prisma.configMaster.update({
      where: { id: parseInt(id) },
      data: { code: code || undefined, value: value || undefined },
    });
    res.json(updated);
  } catch (error) {
    console.error("UpdateConfig error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.configMaster.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ message: "Config not found" });

    await prisma.configMaster.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Config deleted" });
  } catch (error) {
    console.error("DeleteConfig error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { getConfigByCategory, getAllConfigs, createConfig, updateConfig, deleteConfig };
