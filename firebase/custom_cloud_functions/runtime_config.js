const readConfig = () => {
  const raw = process.env.CLOUD_RUNTIME_CONFIG;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      // Ignore malformed runtime config env and try SDK fallback below.
    }
  }

  try {
    // Fallback for runtimes where CLOUD_RUNTIME_CONFIG is not injected.
    const functions = require("firebase-functions/v1");
    if (typeof functions.config === "function") {
      return functions.config() || {};
    }
  } catch (error) {
    // Ignore and fall through to empty config.
  }

  return {};
};

const CONFIG = readConfig();

const getConfigValue = (path, fallback = "") => {
  if (!Array.isArray(path)) return fallback;
  let current = CONFIG;
  for (const key of path) {
    if (!current || typeof current !== "object") return fallback;
    current = current[key];
  }
  return current == null ? fallback : current;
};

module.exports = {
  getConfigValue,
};
