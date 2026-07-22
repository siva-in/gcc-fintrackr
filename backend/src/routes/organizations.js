const express = require("express");
const router = express.Router();
const { getOrganizations, getOrganization, createOrganization, updateOrganization, deleteOrganization, assignUserRole, removeUserRole, validation } = require("../controllers/orgController");
const { authenticate, requireCompanyRole } = require("../middleware/auth");

router.use(authenticate);

router.get("/", getOrganizations);
router.get("/:id", getOrganization);
router.post("/", requireCompanyRole("ADMIN", "EDITOR"), validation.create, createOrganization);
router.put("/:id", requireCompanyRole("ADMIN", "EDITOR"), validation.update, updateOrganization);
router.delete("/:id", requireCompanyRole("ADMIN"), deleteOrganization);
router.post("/:orgId/users", requireCompanyRole("ADMIN", "EDITOR"), validation.assignRole, assignUserRole);
router.delete("/:orgId/users/:userId", requireCompanyRole("ADMIN"), removeUserRole);

module.exports = router;
