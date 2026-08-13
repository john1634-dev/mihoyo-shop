/* eslint-disable @typescript-eslint/no-require-imports */
/** Test-only shim: noop server-only so inventory-crypto can be imported in Node scripts. */
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad(request, parent, isMain);
};
