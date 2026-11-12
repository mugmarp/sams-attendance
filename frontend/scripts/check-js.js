import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
for (const directory of ["public", "scripts", "tests"]) {
  function check(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) check(file);
      else if (file.endsWith(".js")) {
        const result = spawnSync(process.execPath, ["--check", file], {
          stdio: "inherit",
        });
        if (result.status) process.exit(result.status);
      }
    }
  }
  check(directory);
}
console.log(
  "Plain JavaScript syntax checks passed; HTML/CSS/JS are served without a build tool.",
);
