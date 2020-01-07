import { ContainerReflection, DeclarationReflection, Reflection, ReflectionKind } from "typedoc";
import { Component, ConverterComponent } from "typedoc/dist/lib/converter/components";
import { Converter } from "typedoc/dist/lib/converter/converter";
import { Context } from "typedoc/dist/lib/converter/context";
import { CommentPlugin } from "typedoc/dist/lib/converter/plugins/CommentPlugin";
import { parseComment } from "typedoc/dist/lib/converter/factories/comment";
import { ModuleConverter } from "./moduleConverter";
import * as ts from "typescript";
import { Comment } from "typedoc/dist/lib/models";

/**
 * Adds support for module definitions using `@moduledefinition` and module
 * tags using `@module`.
 */
@Component({ name: "custom-modules" })
export class CustomModulesPlugin extends ConverterComponent {
  private _converter: ModuleConverter;

  public static readonly MODULE_TAG = "module";
  public static readonly MODULE_DEFINITION_TAG = "moduledefinition";

  initialize() {
    this.listenTo(this.owner, {
      [Converter.EVENT_BEGIN]: this.onBegin,
      [Converter.EVENT_CREATE_DECLARATION]: this.onDeclaration,
      [Converter.EVENT_RESOLVE]: this.onResolve,
      [Converter.EVENT_RESOLVE_END]: this.onResolveEnd
    });
  }

  /**
   * Triggered when the converter begins converting a project.
   *
   * @param context  The context object describing the current state the converter is in.
   */
  private onBegin(context: Context) {
    this._converter = new ModuleConverter(context);
  }

  /**
   * Triggered when the converter has created a declaration reflection.
   *
   * @param context  The context object describing the current state the converter is in.
   * @param reflection  The reflection that is currently processed.
   * @param node  The node that is currently processed if available.
   */
  private onDeclaration(context: Context, reflection: Reflection, node?: ts.Node) {
    if (reflection.kindOf(ReflectionKind.ExternalModule) && node) {
      // Look through the entire source file, and parse a "comment" from it.
      let comment = CustomModulesPlugin.parseModuleDefinitionComment(node);
      // let comment = parseComment(node.getSourceFile().text);
      if (comment != null && comment.hasTag(CustomModulesPlugin.MODULE_DEFINITION_TAG)) {
        let tag = comment.getTag(CustomModulesPlugin.MODULE_DEFINITION_TAG);
        // The module name doesn't actually get parsed properly by `parseComment`,
        // you end up with the actual code after the comment block ends as well.
        // To work around this, look for a newline character and grab everything
        // before it.
        let match = /(.+)?[\n\r]?/.exec(tag.text);

        CommentPlugin.removeTags(comment, CustomModulesPlugin.MODULE_DEFINITION_TAG);

        if (match != null && match.length >= 1) {
          this._converter.addDefinition({
            name: match[1],
            comment,
            reflection: reflection as ContainerReflection
          });
        }
      }
    }
  }

  /**
   * Triggered during the project resolve phase for every reflection
   * created by the converter.
   *
   * Here, we'll need to identify any exported declaration that contains
   * a comment with a @module tag.  Also, we'll want to identify any
   * Exported Modules that have a @module tag.  We'll use the comments
   * from these to describe the to-be-created modules.
   *
   * @param context  The context object describing the current state the converter is in.
   * @param reflection  The reflection that was processed.
   */
  private onResolve(context: Context, reflection: DeclarationReflection) {
    let moduleName = CustomModulesPlugin.getTaggedModule(reflection);
    if (moduleName != null) {
      this._converter.addDeclaration({
        moduleName,
        reflection
      });
    }
  }

  /**
   * Triggered when the converter begins resolving a project.
   *
   * @param context  The context object describing the current state the converter is in.
   */
  private onResolveEnd(context: Context) {
    // First, iterate through all the module-tagged declarations
    // and create the actual module container Declarations to house the tagged
    // declarations. Then, move the declarations to these new containers.
    this._converter.convertDeclarations();

    // Remove any containers which no longer have any exports due to this change.
    this._converter.removeEmptyContainers();

    // Re-sort the declarations in the entire project, since we likely moved
    // a lot of declarations around.
    this._converter.sortAll();
  }

  /**
   * Extracted from typedoc: `getRawComment` in `src/lib/converter/factories/comment.ts`
   *
   * This code block was problematic.  We need to be able to support files where
   * there is only one comment:
   *
   * ```
   * if (node.kind === ts.SyntaxKind.SourceFile) {
   *   if (comments.length === 1) {
   *     return;
   *   }
   *   comment = comments[0];
   * }
   *  ```
   *
   * @param node the typescript node in which to look for a definition comment
   */
  static parseModuleDefinitionComment(node: ts.Node): Comment {
    let sourceFile = node.getSourceFile();
    let text = sourceFile.text;

    let commentRanges = ts.getLeadingCommentRanges(text, node.pos);
    if (!commentRanges) {
      return null;
    }

    // True if the comment starts with '/**' but not if it is '/**/'
    commentRanges = commentRanges.filter(({ pos }) => {
      return text.substr(pos, 3) === "/**" && text[pos + 4] !== "/";
    });

    if (commentRanges.length >= 1) {
      let comment = commentRanges[0];
      let commentText = sourceFile.text.substring(comment.pos, comment.end);
      return parseComment(commentText);
    }
    return null;
  }

  /**
   * Given a declaration, extract a @module tag in its comment, if one exists.
   *
   * @param reflection
   */
  static getTaggedModule(reflection: DeclarationReflection): string {
    let moduleName;
    if (reflection.flags.isExported) {
      switch (reflection.kind) {
        case ReflectionKind.Function: {
          for (let signature of reflection.getAllSignatures()) {
            if (signature.hasComment()) {
              let signatureModule = CustomModulesPlugin.stripModuleTag(signature);
              if (signatureModule != null) {
                moduleName = signatureModule;
                break;
              }
            }
          }
          break;
        }
        default:
          if (reflection.hasComment()) {
            moduleName = CustomModulesPlugin.stripModuleTag(reflection);
          }
      }
    }
    return moduleName;
  }

  /**
   * Returns the value of a @module tag in the given reflection. If one exists,
   * remove the tag.  If the encapsulating comment is then empty, delete it.
   *
   * @param reflection
   */
  static stripModuleTag(reflection: Reflection): string | undefined {
    let comment = reflection.comment;
    let moduleName;
    if (comment.hasTag(CustomModulesPlugin.MODULE_TAG)) {
      let moduleText = comment.getTag(CustomModulesPlugin.MODULE_TAG).text;
      if (moduleText != null && moduleText.trim().length > 0) {
        moduleName = moduleText.trim();
      }
    }

    // remove the @module tag. If this makes the comment empty, delete it
    // as well.
    if (moduleName) {
      CommentPlugin.removeTags(comment, CustomModulesPlugin.MODULE_TAG);
      if (comment.shortText == null || comment.shortText.length === 0) {
        delete reflection.comment;
      }
    }

    return moduleName;
  }
}
