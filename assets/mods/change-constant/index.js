/* eslint-disable */

module.exports = function (config) {
  if (config.common) {
    try {
      const path = require("path");
      const constants = require(path.resolve("server", "constants.json"));
      Object.assign(config.common.constants, constants);
    } catch (err) {
      // PASS
    }
  }
};
