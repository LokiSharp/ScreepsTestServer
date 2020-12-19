import { existsSync, mkdirSync, writeJSONSync } from "fs-extra";
import path from "path";

export function setConstants(constants: unknown): void {
  if (!existsSync(path.resolve("server"))) {
    void mkdirSync(path.resolve("server"));
  }
  const filePath = path.resolve("server", "constants.json");
  return writeJSONSync(filePath, constants);
}
