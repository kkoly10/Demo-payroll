import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"payroll-domain-"));
function compile(dir) {
  for (const file of fs.readdirSync(dir,{withFileTypes:true})) {
    const input=path.join(dir,file.name);
    if(file.isDirectory()) { compile(input); continue; }
    if(!input.endsWith(".ts")) continue;
    const output=path.join(temp,input.replace(/^src\//,"").replace(/\.ts$/,".js"));
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,ts.transpileModule(fs.readFileSync(input,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);
  }
}
try {
  compile("src/lib");compile("src/data");
  const result=spawnSync(process.execPath,["--test","tests/domain.test.mjs"],{stdio:"inherit",env:{...process.env,PAYROLL_TEST_BUILD:temp}});
  process.exitCode=result.status??1;
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
