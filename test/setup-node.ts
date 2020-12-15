/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore : allow adding mocha to global
global.mocha = require("mocha");
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore : allow adding chai to global
global.chai = require("chai");

process.env.TS_NODE_PROJECT = "tsconfig.test.json";
