const express = require("express");
const router = express.Router();
const { getRoleAssignments, assignRole, removeRoleAssignment, getRoles, createRole, updateRole, deleteRole, validation } = require("../controllers/roleController");
const { authenticate, requireCompanyRole } = require("../middleware/auth");

router.use(authenticate);

router.get("/", getRoleAssignments);
router.get("/master", getRoles);
router.post("/master", requireCompanyRole("ADMIN", "EDITOR"), validation.createRole, createRole);
router.put("/master/:id", requireCompanyRole("ADMIN", "EDITOR"), validation.updateRole, updateRole);
router.delete("/master/:id", requireCompanyRole("ADMIN"), deleteRole);
router.post("/assign", requireCompanyRole("ADMIN", "EDITOR"), validation.assign, assignRole);
router.delete("/:id", requireCompanyRole("ADMIN"), removeRoleAssignment);

module.exports = router;
