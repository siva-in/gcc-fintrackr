require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 5010;

app.listen(PORT, async () => {
  console.log(`FinTrackr API running on port ${PORT}`);
});

module.exports = app;
