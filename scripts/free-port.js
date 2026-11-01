const { execSync } = require("node:child_process");

const port = Number(process.argv[2] || process.env.PORT || 8765);
if (!Number.isInteger(port) || port <= 0) {
  console.error("Invalid port.");
  process.exit(1);
}

function run(command) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function windowsPids() {
  const output = run(`netstat -ano -p tcp`);
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.includes("LISTENING")) continue;
    const parts = trimmed.split(/\s+/);
    const localAddress = parts[1] || "";
    const pid = parts[parts.length - 1];
    if (localAddress.endsWith(`:${port}`) && /^\d+$/.test(pid)) pids.add(pid);
  }
  return [...pids];
}

function unixPids() {
  try {
    return run(`lsof -ti tcp:${port} -sTCP:LISTEN`)
      .split(/\r?\n/)
      .map((pid) => pid.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
  } else {
    execSync(`kill -TERM ${pid}`, { stdio: "ignore" });
  }
}

const pids = process.platform === "win32" ? windowsPids() : unixPids();
for (const pid of pids) killPid(pid);

if (pids.length) {
  console.log(`Freed port ${port}: stopped PID ${pids.join(", ")}`);
}
