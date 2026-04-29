import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const commands = [
    { label: "local", command: "npm test" },
    { label: "live", command: "npm run test:trakt:live" }
];

function runCommand({ label, command }) {
    return new Promise((resolve) => {
        const child = spawn(command, {
            cwd: rootDir,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
            shell: true
        });

        const prefixOutput = (stream, writer) => {
            let buffer = "";
            stream.on("data", (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? "";
                lines.forEach((line) => {
                    writer(`[${label}] ${line}\n`);
                });
            });
            stream.on("end", () => {
                if (buffer) {
                    writer(`[${label}] ${buffer}\n`);
                }
            });
        };

        prefixOutput(child.stdout, process.stdout.write.bind(process.stdout));
        prefixOutput(child.stderr, process.stderr.write.bind(process.stderr));

        child.on("error", (error) => {
            process.stderr.write(`[${label}] Failed to start: ${error}\n`);
            resolve(1);
        });

        child.on("close", (code) => {
            resolve(Number(code ?? 1));
        });
    });
}

async function main() {
    const results = await Promise.all(commands.map(runCommand));
    const failed = results.some((code) => code !== 0);
    process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
