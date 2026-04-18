const { Queue } = require("bullmq");
const config = require("./config");

const alertQueue = new Queue("alerts", { connection: config.redis });
const dlq = new Queue("alerts-dead-letter", { connection: config.redis });

module.exports = { alertQueue, dlq };
