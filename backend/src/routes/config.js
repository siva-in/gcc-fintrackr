const express = require("express");
const router = express.Router();
const { getConfigByCategory, getAllConfigs, createConfig, updateConfig, deleteConfig } = require("../controllers/configController");

router.get("/category/:category", getConfigByCategory);
router.get("/", getAllConfigs);
router.post("/", createConfig);
router.put("/:id", updateConfig);
router.delete("/:id", deleteConfig);

module.exports = router;
