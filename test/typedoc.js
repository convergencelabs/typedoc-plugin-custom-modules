module.exports = {
  name: "Some API Documentation",
  target: "ES6",

  excludeExternals: true,
  excludeNotExported: true,
  excludePrivate: true,
  excludeProtected: true,

  mode: "modules",
  out: "test/dist/docs",
  baseUrl: "src/main/ts",
  json: "test/dist/docs.json",

  verbose: true,
  hideGenerator: true
};