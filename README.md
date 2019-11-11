# Custom Modules for Typedoc

By default, Typedoc (with the `mode="modules"` option) will create a [Module](https://www.typescriptlang.org/docs/handbook/modules.html) ([née "External Module"](https://github.com/TypeStrong/typedoc/issues/109)) for every file with any exported ES6 constructs. This can result in an unmanageable amount of globals, poor discoverability, and difficult navigation. This plugin enables the grouping of these modules by a particular name.

This plugin supports two additional comment tags:

- `@moduledefinition ModuleName` can be placed at the top of a file that best represents a "module" for your codebase. This will create a `ModuleName` module in the top-level project hierarchy.
- `@module ModuleName` can be added to the comment of any other valid exported Typescript declaration (e.g. a class, interface, function, enum etc). These declarations will be moved to any modules specified with `@moduledefinition`. Any orphaned modules (e.g. a file that exports a `@module`-tagged class and nothing else) are deleted.

Additionally, **all** exported TS constructs not explicitly tagged with `@module` are automatically unwrapped from the default "module" (which is just the file in which it is defined) and placed directly beneath the project. This should be identical to using Typedoc with `mode="file"`.

See the [`test/example1`](/test/example1) directory for a typical use case for this plugin.

Requires typedoc 0.16.0 (yet unreleased)! This is currently built on top of [Typedoc PR #801](https://github.com/TypeStrong/typedoc/pull/801), which enables the support of export declarations.

Inspired by the popular [typedoc-plugin-external-module-name](https://github.com/christopherthielen/typedoc-plugin-external-module-name), but with a slightly different set of requirements. This plugin leverages some improved TypeDoc comment APIs to support spaces within module names.

## Caveats

- The comment containing a `@moduledefinition` must be the FIRST thing in a file. E.g. no `import` statements above it, no header license comments, etc.

TODO

- [ ] re-test with exported object literals

Potential future enhancements:

- Support per-file comments as well. Individual export `@module`s override any file `@module`s though
- Nested modules with a `@parent` tag or something
