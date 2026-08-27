const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const pidPath = path.join(process.cwd(), "harness", "_sole_chase_shot.pid");
const end = Date.now() + 480000;
function solePid() {
  try { return Number(fs.readFileSync(pidPath, "utf8").trim()) || null; } catch { return null; }
}
console.log("killer_up", process.pid);
while (Date.now() < end) {
  const keep = solePid();
  try {
    const out = execSync("wmic process where \"name='node.exe'\" get ProcessId,CommandLine /FORMAT:CSV", { encoding: "utf8" });
    for (const line of out.split(/\r?\n/)) {
      if (!/_overnight_/i.test(line)) continue;
      // NEVER kill chase_shot — we are the sole chase probe
      if (/_overnight_chase_shot\.mjs/i.test(line)) continue;
      if (/_sole_killer|_sole_chase_watch/i.test(line)) continue;
      const m = line.match(/,(\d+)\s*$/);
      if (!m) continue;
      const pid = Number(m[1]);
      if (!pid || pid === process.pid || (keep && pid === keep)) continue;
      try { process.kill(pid); console.log(new Date().toISOString(), "KILL", pid); } catch {}
    }
  } catch {}
  if (keep == null) {
    // if sole finished and no pid for 20s, exit early after min run
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500);
}
