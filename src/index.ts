import { Application } from "typedoc/dist/lib/application";
import { CustomModulesPlugin } from "./CustomModulesPlugin";
import { CustomModulesNavPlugin } from './CustomModulesNavPlugin';

export = (PluginHost: Application) => {
  const app = PluginHost.owner;

  app.converter.addComponent("custom-modules", new CustomModulesPlugin(app.converter));

  app.renderer.removeComponent("navigation");
  app.renderer.addComponent("navigation", new CustomModulesNavPlugin(app.renderer));
};
