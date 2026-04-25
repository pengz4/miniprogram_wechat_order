const { startServer } = require("./backend/server");

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
