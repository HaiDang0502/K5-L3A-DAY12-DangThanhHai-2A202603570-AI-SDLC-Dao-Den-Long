// Builds the runnable release bundle: dist/dao-den-long-v<version>.tar.gz
// The bundle already contains three.module.js, so it runs with Node only:  tar -xzf ... && cd ... && node scripts/serve.js
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const name = `dao-den-long-v${pkg.version}`;
const out = join("dist", name);
rmSync("dist", { recursive: true, force: true });
mkdirSync(join(out, "node_modules/three/build"), { recursive: true });
for (const d of ["src", "scripts", "tests"]) cpSync(d, join(out, d), { recursive: true });
for (const f of ["package.json", "game.contract.json", "README.md", "CHANGELOG.md", "CREDITS.md", "LICENSE"]) copyFileSync(f, join(out, f));
copyFileSync("node_modules/three/build/three.module.js", join(out, "node_modules/three/build/three.module.js"));
copyFileSync("node_modules/three/LICENSE", join(out, "node_modules/three/LICENSE"));
writeFileSync(join(out, "node_modules/three/package.json"), JSON.stringify({ name: "three", version: "0.160.0", type: "module", license: "MIT" }));
writeFileSync(join(out, "RUN.txt"), `Đảo Đèn Lồng ${pkg.version}\nYêu cầu: Node.js >= 18 và một trình duyệt hỗ trợ WebGL2.\n\n  node scripts/serve.js      -> mở http://localhost:8080\n\nHeadless/test/bench/soak: xem README.md.\n`);
execFileSync("tar", ["-czf", `${name}.tar.gz`, name], { cwd: "dist", stdio: "inherit" });
console.log(`dist/${name}.tar.gz`);
