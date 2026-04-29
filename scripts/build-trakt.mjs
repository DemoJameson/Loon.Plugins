import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envCacheFile = path.join(rootDir, "scripts", "vendor", "Env.js");
const envModuleFile = path.join(rootDir, "scripts", "vendor", "Env.module.mjs");
const envSourceUrl = "https://github.com/DemoJameson/scripts/blob/feat-more-env/Env.js";
const externalModules = ["fs", "path", "got", "tough-cookie", "iconv-lite"];
const isSyncEnvMode = process.argv.includes("--sync-env");

const buildTargets = [
    {
        entryPoint: "trakt_simplified_chinese/src/trakt_simplified_chinese.source.mjs",
        outputFile: "trakt_simplified_chinese/trakt_simplified_chinese.js"
    },
    {
        entryPoint: "trakt_simplified_chinese/src/trakt_simplified_chinese_clear_cache.source.mjs",
        outputFile: "trakt_simplified_chinese/trakt_simplified_chinese_clear_cache.js"
    },
    {
        entryPoint: "trakt_simplified_chinese/src/trakt_simplified_chinese_expand_cache.source.mjs",
        outputFile: "trakt_simplified_chinese/trakt_simplified_chinese_expand_cache.js"
    }
];

async function fileExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function readEnvSourceFromCache() {
    return fs.readFile(envCacheFile, "utf8");
}

function resolveEnvFetchUrl(url) {
    const githubBlobMatch = String(url).match(
        /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
    );

    if (githubBlobMatch) {
        const [, owner, repo, ref, filePath] = githubBlobMatch;
        return `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${ref}/${filePath}`;
    }

    return url;
}

async function fetchEnvSource() {
    const response = await fetch(resolveEnvFetchUrl(envSourceUrl));
    if (!response.ok) {
        throw new Error(`Failed to fetch Env.js: ${response.status} ${response.statusText}`);
    }

    return response.text();
}

async function writeEnvCache(source) {
    await fs.mkdir(path.dirname(envCacheFile), { recursive: true });
    await fs.writeFile(envCacheFile, source, "utf8");
}

async function writeEnvModule(source) {
    const moduleSource = `${source.trim()}\n\nexport { Env };\nexport default Env;\n`;
    await fs.mkdir(path.dirname(envModuleFile), { recursive: true });
    await fs.writeFile(envModuleFile, moduleSource, "utf8");
}

async function ensureEnvSource(forceRefresh = false) {
    const hasCache = await fileExists(envCacheFile);

    if (!forceRefresh && hasCache) {
        const envSource = await readEnvSourceFromCache();
        await writeEnvModule(envSource);
        return envSource;
    }

    const envSource = await fetchEnvSource();
    await writeEnvCache(envSource);
    await writeEnvModule(envSource);
    return envSource;
}

async function buildBundle(entryPoint) {
    const result = await esbuild.build({
        entryPoints: [entryPoint],
        absWorkingDir: rootDir,
        bundle: true,
        format: "iife",
        platform: "browser",
        target: ["safari15"],
        charset: "utf8",
        legalComments: "none",
        sourcemap: false,
        minify: true,
        treeShaking: true,
        external: externalModules,
        write: false
    });

    return result.outputFiles[0].text;
}

async function writeTarget(outputFile, content) {
    const targetPath = path.join(rootDir, outputFile);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");
}

async function buildTrakt() {
    await ensureEnvSource(isSyncEnvMode);

    for (const target of buildTargets) {
        const scriptSource = await buildBundle(target.entryPoint);
        await writeTarget(target.outputFile, scriptSource);
    }
}

buildTrakt().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
