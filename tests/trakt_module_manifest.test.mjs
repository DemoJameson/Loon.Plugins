import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { renderGeneratedTargets } from "../scripts/build-trakt.mjs";
import { argumentFields, BOXJS_CONFIG_KEY } from "../trakt_simplified_chinese/src/module-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function normalizeLineEndings(value) {
    return String(value).replace(/\r\n/g, "\n");
}

test("module manifest renders tracked Trakt subscription and BoxJs files", async () => {
    const generatedTargets = renderGeneratedTargets();

    for (const target of generatedTargets) {
        const actual = await readFile(path.join(rootDir, target.outputFile), "utf8");
        assert.equal(normalizeLineEndings(actual), normalizeLineEndings(target.content), `${target.outputFile} should be generated from module-manifest.mjs`);
    }
});

test("module manifest generates current BoxJs keys from argument fields", async () => {
    const boxjsTarget = renderGeneratedTargets().find((target) => target.outputFile === "boxjs.json");
    assert.ok(boxjsTarget);
    assert.equal(boxjsTarget.content.includes("latestHistoryEpisodeOnly"), false);

    const payload = JSON.parse(boxjsTarget.content);
    const app = payload.apps[0];
    const expectedKeys = argumentFields.map((field) => `@${BOXJS_CONFIG_KEY}.${field.key}`);

    assert.deepEqual(app.keys, expectedKeys);
    assert.deepEqual(
        app.settings.map((setting) => setting.id),
        expectedKeys,
    );
    assert.ok(app.keys.includes(`@${BOXJS_CONFIG_KEY}.historyEpisodesMergedByShow`));
});
