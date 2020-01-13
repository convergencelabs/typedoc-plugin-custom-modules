import { Application, normalizePath, resetReflectionID, ProjectReflection } from "typedoc";
import * as fs from "fs";
import * as Path from "path";
import Assert = require("assert");

import * as testConfig from "./typedoc";

const base = __dirname;

function normalizeSerialized(data: any, currentDir: string) {
  return JSON.parse(
    JSON.stringify(data)
      .split(currentDir)
      .join("%DIR%")
      .split(normalizePath(base))
      .join("%BASE_URL%")
  );
}

/**
 * Adapted from the typedoc test suite.
 */
describe("Converter", () => {
  Object.assign(testConfig, {
    tsconfig: Path.join(base, "tsconfig.json")
  });

  let app = new Application();
  app.bootstrap(testConfig);

  fs.readdirSync(base).forEach(directory => {
    const path = Path.join(base, directory);
    if (!fs.lstatSync(path).isDirectory()) {
      return;
    }

    describe(directory, () => {
      if (!fs.existsSync(Path.join(path, `spec.json`))) {
        return;
      }

      let result: ProjectReflection | undefined;
      it(`${directory} converts fixtures`, () => {
        resetReflectionID();
        result = app.convert(app.expandInputFiles([path]));
        Assert(result instanceof ProjectReflection, "No reflection returned");
      });

      it(`${directory} matches specs`, () => {
        const specs = JSON.parse(fs.readFileSync(Path.join(path, `spec.json`), "utf-8"));
        let normalizedResult = normalizeSerialized(app.serializer.toObject(result), directory);
        Assert.deepStrictEqual(normalizedResult, specs);
      });
    });
  });
});
