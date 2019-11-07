import { Application } from "typedoc/dist/lib/Application";
import { normalizePath } from "typedoc/dist/lib/utils";
import * as fs from "fs";
import * as Path from "path";
import Assert = require("assert");

import * as testConfig from "./typedoc";
import { resetReflectionID } from "typedoc/dist/lib/models/reflections/abstract";
import { ProjectReflection } from "typedoc/dist/lib/models";

const base = __dirname;

function normalizeSerialized(data: any) {
  return JSON.parse(
    JSON.stringify(data)
      .split(normalizePath(base))
      .join("%BASE_URL%")
  );
}

/**
 * Adapted from the typedoc test suite.
 */
describe("Converter", () => {
  let app: Application;

  Object.assign(testConfig, {
    tsconfig: Path.join(base, "tsconfig.json")
  });

  before("constructs", () => {
    app = new Application(testConfig);
  });

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
        Assert.deepStrictEqual(normalizeSerialized(result!.toObject()), specs);
      });
    });
  });
});
