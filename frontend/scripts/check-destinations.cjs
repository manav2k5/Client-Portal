const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname,"../src/components");
const output = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,"resolveDestination.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports:output,require:p=>require(path.resolve(root,p)),Map,Set});
const resolve = output.resolveDestination;
for(const input of ["Texas","TEXAS","USA","India","Maharashtra","Los Angeles, California, USA"]) assert.equal(resolve(input).length,1,input);
assert.equal(resolve("Los Angeles").length,2);
assert.equal(resolve("not-a-real-destination").length,0);
assert.equal(resolve("").length,0);
assert.equal(resolve("Texas")[0].key,resolve("TEXAS")[0].key);
assert.equal(resolve("USA")[0].key,resolve("United States")[0].key);
console.log("Destination resolution regression checks passed.");

for (const name of ["Africa", "Asia", "Europe", "North America", "South America", "Oceania", "Antarctica"]) {
 const matches = resolve(name);
 assert.equal(matches.length, 1, name);
 assert.equal(matches[0].key, `continent:${name}`);
 assert.ok(Number.isFinite(matches[0].lon) && Number.isFinite(matches[0].lat));
}
assert.equal(resolve(" AFRICA ")[0].key, resolve("Africa")[0].key);
assert.equal(resolve("South Africa")[0].key, "country:South Africa");
console.log("Continent resolution regression checks passed.");
