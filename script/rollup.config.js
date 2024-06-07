const nodeResolve = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const json = require("@rollup/plugin-json");
const terser = require("@rollup/plugin-terser");

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
    input: "./script/dr-decorator.js",
    output: {
        file: "./dist/dr-decorator.js",
        format: "cjs",
    },
    plugins: [nodeResolve(), commonjs(), json(), 
        // terser()
    ],
};

module.exports = config;
