import { Application } from 'typedoc/dist/lib/application';
import { CustomModulesPlugin } from './plugin';

export = (PluginHost: Application) => {
  const app = PluginHost.owner;

  app.converter.addComponent('markdown', new CustomModulesPlugin(app.converter));
};