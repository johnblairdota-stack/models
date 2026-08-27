const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = process.cwd();
const pidPath = path.join(ROOT, "harness", "_sole_chase_shot.pid");
let childPid = null;
function killCompetitors() {
  try {
    const out = execSync("wmic process where \"name='node.exe'\" get ProcessId,CommandLine /FORMAT:CSV", { encoding: "utf8" });
    for (const line of out.split(/\r?\n/)) {
      if (!/_overnight_/i.test(line)) continue;
      if (/_sole_chase_watch/i.test(line)) continue;
      const m = line.match(/,(\d+)\s*$/);
      if (!m) continue;
      const pid = Number(m[1]);
      if (!pid || pid === process.pid || pid === childPid) continue;
      // only kill OTHER overnight harnesses, never our chase_shot child
      if (/_overnight_chase_shot\.mjs/i.test(line) && childPid && pid === childPid) continue;
      if (/_overnight_chase_shot\.mjs/i.test(line)) {
        // If another chase_shot (not ours), kill it
        if (pid !== childPid) {
          try { process.kill(pid); console.error("SOLE_KILL_OTHER_CHASE", pid); } catch (_) {}
        }
        continue;
      }
      try { process.kill(pid); console.error("SOLE_KILL", pid, line.slice(0, 120)); } catch (_) {}
    }
  } catch (e) {
    console.error("killCompetitors_err", e.message);
  }
}
killCompetitors();
const child = spawn(process.execPath, ["harness/_overnight_chase_shot.mjs"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
childPid = child.pid;
fs.writeFileSync(pidPath, String(childPid));
console.error("SOLE_CHILD", childPid);
child.stdout.on("data", (d) => process.stdout.write(d));
child.stderr.on("data", (d) => process.stderr.write(d));
const iv = setInterval(killCompetitors, 5000);
child.on("exit", (code, sig) => {
  clearInterval(iv);
  try { fs.unlinkSync(pidPath); } catch (_) {}
  console.error("CHILD_EXIT", code, sig);
  process.exit(code == null ? 1 : code);
});
