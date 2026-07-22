const express = require("express");
const router = express.Router();
const { getRequests, getRequest, createRequest, approveOrRejectRequest, getMyPendingApprovals, validation } = require("../controllers/requestController");
const { authenticate, requireOrg, requireOrgRole } = require("../middleware/auth");

router.use(authenticate);
router.use(requireOrg);

router.get("/", getRequests);
router.get("/my-approvals", getMyPendingApprovals);
router.get("/:id", getRequest);
router.post("/", requireOrgRole("MANAGER", "LEADER"), validation.create, createRequest);
router.post("/:id/approve", requireOrgRole("LEADER"), validation.approve, approveOrRejectRequest);

module.exports = router;
