const express = require("express");
const router = express.Router();
const { getBizPartners, getBizPartner, createBizPartner, updateBizPartner, deleteBizPartner, validation } = require("../controllers/bizPartnerController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/", getBizPartners);
router.get("/:id", getBizPartner);
router.post("/", validation.create, createBizPartner);
router.put("/:id", validation.update, updateBizPartner);
router.delete("/:id", deleteBizPartner);

module.exports = router;
