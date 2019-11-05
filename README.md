# Custom Modules for Typedoc

Requirements:

Functionality:

- Just like `typedoc-plugin-external-module-name`, collect module names and organizes the exported constructs by module
- @module ModuleName syntax
- Start with comments on individual exports.
- Files with a comment with @module are assumed to contain the module's defintion in that comment.
- Support spaces in module names
- (Probably a typedoc change): module files with no exported constructs should not export a blank module

Nice-to-haves:

- Support per-file comments as well. Individual export `@module`s override any file `@module`s though
- Looks for @module tag in the _first_ comment of the file, doesn't have to be the first thing in the file.
- Don't support comments in anything but the first comment block. Ideally it will just use the first file comment with a @module tag
- File @module tags shouldn't require other comments in the file (if possible...)

Development:

- Debug in TS (if possible)
- Tests using typedoc JSON export, comparing export just like the tests in the typedoc repo. Our comparisons should only look at the actual modules, though, ignoring everything else.
- Supports latest typedoc only

Todo:

- [ ] Start with example directory with a very basic use case.
- [ ] Play around with sourcemaps in the typedoc dist and this module's dist such that we can debug in TS
