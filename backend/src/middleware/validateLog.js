const VALID_LEVELS = ["INFO", "WARNING", "ERROR", "DEBUG"];

function validateLog(req, res, next) {
  const { level, message, service } = req.body;

  if (!level) {
    return res.status(400).json({ error: "level is required" });
  }

  if (!VALID_LEVELS.includes(level.toUpperCase())) {
    return res.status(400).json({
      error: `invalid level. must be one of: ${VALID_LEVELS.join(", ")}`,
    });
  }

  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "message is required and must be a string" });
  }

  // normalize
  req.body.level = level.toUpperCase();
  req.body.service = service || "unknown";
  req.body.message = message.trim();

  next();
}

module.exports = { validateLog };
