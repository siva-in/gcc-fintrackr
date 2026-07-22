const express = require("express");
const router = express.Router();
const { getUsers, getUser, createUser, updateUser, deleteUser, validation } = require("../controllers/userController");
const { authenticate, requireCompanyRole, getUserCompanyRoleNames } = require("../middleware/auth");

router.use(authenticate);

const allowCreate = async (req, res, next) => {
  if (req.user.userLevel === "COMPANY") {
    return requireCompanyRole("ADMIN", "EDITOR")(req, res, next);
  }
  // ORG users can proceed — controller will enforce userLevel=ORG
  next();
};

router.get("/", getUsers);
router.get("/:id", getUser);
router.post("/", allowCreate, validation.create, createUser);
router.put("/:id", allowCreate, validation.update, updateUser);
router.delete("/:id", requireCompanyRole("ADMIN"), deleteUser);

module.exports = router;
