import { scryptSync, randomBytes } from "node:crypto";
// Read from stdin, never from command-line arguments or committed configuration.
if (process.stdin.isTTY)
  console.error(
    "Enter the owner password, then press Ctrl+Z and Enter (Windows) or Ctrl+D (Unix). Input may be visible in this terminal.",
  );
let input = "";
for await (const chunk of process.stdin) input += chunk;
const pin = input.replace(/[\r\n]+$/, "");
if (pin.length < 12 || pin.length > 128)
  throw new Error("Use 12 to 128 characters");
const salt = randomBytes(16).toString("hex");
const key = scryptSync(pin, salt, 32, {
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
}).toString("hex");
console.log(`scrypt$${salt}$${key}`);
