require("dotenv").config();

module.exports = {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  port: parseInt(process.env.PORT || "3001"),
};
