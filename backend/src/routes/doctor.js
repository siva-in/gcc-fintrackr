const express = require("express");
const router = express.Router();
const { getDoctors, getDoctor, createDoctor, updateDoctor, deleteDoctor, validation } = require("../controllers/doctorController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/", getDoctors);
router.get("/:id", getDoctor);
router.post("/", validation.create, createDoctor);
router.put("/:id", validation.update, updateDoctor);
router.delete("/:id", deleteDoctor);

module.exports = router;
