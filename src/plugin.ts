import { Reflection, ReflectionKind, ReflectionFlag } from "typedoc/dist/lib/models/reflections/abstract";
import { DeclarationReflection } from "typedoc/dist/lib/models/reflections/declaration";
import { Component, ConverterComponent } from "typedoc/dist/lib/converter/components";
import { Converter } from "typedoc/dist/lib/converter/converter";
import { Context } from "typedoc/dist/lib/converter/context";
import { CommentPlugin } from "typedoc/dist/lib/converter/plugins/CommentPlugin";
import { ContainerReflection } from "typedoc/dist/lib/models/reflections/container";
import { parseComment } from "typedoc/dist/lib/converter/factories/comment";
import { ModuleConverter } from "./moduleConverter";
import * as ts from "typescript";
import { Comment } from "typedoc/dist/lib/models";

/**
 *
 */
@Component({ name: "custom-modules" })
export class CustomModulesPlugin extends ConverterComponent {
  private _converter: ModuleConverter;

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
      // This isn't really how
      let comment = CustomModulesPlugin.parseModuleDefinitionComment(node);
      if (comment != null && comment.hasTag("moduledefinition")) {
        let tag = comment.getTag("moduledefinition");
        // The module name doesn't actually get parsed properly by `parseComment`,
        // you end up with the actual code after the comment block ends as well.
        // To work around this, look for a newline character and grab everything
        // before it.
        let match = /(.+)?[\n\r]?/.exec(tag.text);

        CommentPlugin.removeTags(comment, "moduledefinition");

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
   * Here, we need to iterate through all the module-tagged declarations
   * and create the actual module container Declarations to house the tagged
   * declarations. Then, we'll need to move the declarations to these new
   * containers.  We'll also want to remove any containers which no longer
   * have any exports due to this change.
   *
   * @param context  The context object describing the current state the converter is in.
   */
  private onResolveEnd(context: Context) {
    this._converter.collectProjectReflections();

    this._converter.convertDeclarations();

    this._converter.removeEmptyContainer();
  }

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

  static getTaggedModule(reflection: DeclarationReflection): string {
    let moduleName;
    if (reflection.flags.hasExport) {
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

  static stripModuleTag(reflection: Reflection): string | undefined {
    let comment = reflection.comment;
    let moduleName;
    if (comment.hasTag("module")) {
      let moduleText = comment.getTag("module").text;
      if (moduleText != null && moduleText.trim().length > 0) {
        moduleName = moduleText.trim();
      }
    }

    // remove the @module tag. If this makes the comment empty, delete it
    // as well.
    if (moduleName) {
      CommentPlugin.removeTags(comment, "module");
      if (comment.shortText == null || comment.shortText.length === 0) {
        delete reflection.comment;
      }
    }

    return moduleName;
  }
}
