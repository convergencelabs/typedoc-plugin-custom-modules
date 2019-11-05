import { Reflection, ReflectionKind } from "typedoc/dist/lib/models/reflections/abstract";
import { DeclarationReflection } from "typedoc/dist/lib/models/reflections/declaration";
import { Component, ConverterComponent } from "typedoc/dist/lib/converter/components";
import { Converter } from "typedoc/dist/lib/converter/converter";
import { Context } from "typedoc/dist/lib/converter/context";
import { CommentPlugin } from "typedoc/dist/lib/converter/plugins/CommentPlugin";
import { ContainerReflection } from "typedoc/dist/lib/models/reflections/container";
import { getRawComment } from "typedoc/dist/lib/converter/factories/comment";
import { Comment } from "typedoc/dist/lib/models";

/**
 * This plugin allows an ES6 module to specify its TypeDoc name.
 * It also allows multiple ES6 modules to be merged together into a single TypeDoc module.
 *
 * @usage
 * At the top of an ES6 module, add a "dynamic module comment".  Insert "@module typedocModuleName" to
 * specify that this ES6 module should be merged with module: "typedocModuleName".
 *
 * Similar to the [[DynamicModulePlugin]], ensure that there is a comment tag (even blank) for the
 * first symbol in the file.
 *
 * @example
 * ```
 *
 * &#47;**
 *  * @module newModuleName
 *  *&#47;
 * &#47;** for typedoc &#47;
 * import {foo} from "../foo";
 * export let bar = "bar";
 * ```
 *
 * Also similar to [[DynamicModulePlugin]], if @preferred is found in a dynamic module comment, the comment
 * will be used as the module comment, and documentation will be generated from it (note: this plugin does not
 * attempt to count lengths of merged module comments in order to guess the best one)
 */
@Component({ name: "custom-modules" })
export class CustomModulesPlugin extends ConverterComponent {
  private static readonly SUPPORTED_REFLECTIONS = [ReflectionKind.ClassOrInterface, ReflectionKind.FunctionOrMethod];
  /** List of module reflections which are models to rename */
  private moduleRenames: ModuleRename[];
  private moduleDeclarations: ModuleDeclaration[];

  initialize() {
    this.listenTo(this.owner, {
      [Converter.EVENT_BEGIN]: this.onBegin,
      // [Converter.EVENT_CREATE_DECLARATION]: this.onDeclaration,
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
    this.moduleRenames = [];
    this.moduleDeclarations = [];
  }

  /**
   * Triggered when the converter has created a declaration reflection.
   *
   * @param context  The context object describing the current state the converter is in.
   * @param reflection  The reflection that is currently processed.
   * @param node  The node that is currently processed if available.
   */
  private onDeclaration(context: Context, reflection: Reflection, node?) {
    if (reflection.kindOf(ReflectionKind.ExternalModule)) {
      let comment = getRawComment(node);
      // Look for @module
      let match = /@module\s+([\w\u4e00-\u9fa5\.\-_/@"]+)/.exec(comment);
      if (match) {
        // Look for @preferred
        let preferred = /@preferred/.exec(comment);
        // Set up a list of renames operations to perform when the resolve phase starts
        this.moduleRenames.push({
          renameTo: match[1],
          preferred: preferred != null,
          reflection: reflection as ContainerReflection
        });
      }
    }

    if (reflection.comment) {
      CommentPlugin.removeTags(reflection.comment, "module");
      CommentPlugin.removeTags(reflection.comment, "preferred");
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
    let moduleName = this._getTaggedModule(reflection);
    if (moduleName != null) {
      this.moduleDeclarations.push({
        moduleName,
        reflection
      });
    }
  }

  private _getTaggedModule(reflection: DeclarationReflection): string {
    let moduleName;
    if (reflection.flags.hasExport) {
      switch (reflection.kind) {
        case ReflectionKind.Function: {
          for (let signature of reflection.getAllSignatures()) {
            if (signature.hasComment()) {
              let signatureModule = this._getModuleName(signature.comment);
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
            moduleName = this._getModuleName(reflection.comment);
          }
      }
    }
    return moduleName;
  }

  private _getModuleName(comment: Comment): string | undefined {
    if (comment.hasTag("module")) {
      let moduleName = comment.getTag("module").text;
      if (moduleName != null && moduleName.trim().length > 0) {
        return moduleName.trim();
      }
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
    let projRefs = context.project.reflections;
    let refsArray: Reflection[] = Object.keys(projRefs).reduce((m, k) => {
      m.push(projRefs[k]);
      return m;
    }, []);

    this.moduleDeclarations.forEach(moduleDeclaration => {
      console.log(moduleDeclaration.moduleName);
    });
  }

  private oldOnBeginResolve(context: Context) {
    let projRefs = context.project.reflections;
    let refsArray: Reflection[] = Object.keys(projRefs).reduce((m, k) => {
      m.push(projRefs[k]);
      return m;
    }, []);

    // Process each rename
    this.moduleRenames.forEach(item => {
      let renaming = item.reflection;

      // Find or create the module tree until the child's parent (each level is separated by .)
      let nameParts = item.renameTo.split(".");
      let parent: ContainerReflection = context.project;
      for (let i = 0; i < nameParts.length - 1; ++i) {
        let child: DeclarationReflection = parent.children.filter(ref => ref.name === nameParts[i])[0];
        if (!child) {
          child = new DeclarationReflection(nameParts[i], ReflectionKind.ExternalModule, parent);
          child.parent = parent;
          child.children = [];
          context.project.reflections[child.id] = child;
          parent.children.push(child);
        }
        parent = child;
      }

      // Find an existing module with the child's name in the last parent. Use it as the merge target.
      let mergeTarget = parent.children.filter(
        ref => ref.kind === renaming.kind && ref.name === nameParts[nameParts.length - 1]
      )[0] as ContainerReflection;

      // If there wasn't a merge target, change the name of the current module, connect it to the right parent and exit.
      if (!mergeTarget) {
        renaming.name = nameParts[nameParts.length - 1];
        let oldParent = renaming.parent as ContainerReflection;
        for (let i = 0; i < oldParent.children.length; ++i) {
          if (oldParent.children[i] === renaming) {
            oldParent.children.splice(i, 1);
            break;
          }
        }
        item.reflection.parent = parent;
        parent.children.push(renaming as DeclarationReflection);
        return;
      }

      if (!mergeTarget.children) {
        mergeTarget.children = [];
      }

      // Since there is a merge target, relocate all the renaming module's children to the mergeTarget.
      let childrenOfRenamed = refsArray.filter(ref => ref.parent === renaming);
      childrenOfRenamed.forEach((ref: Reflection) => {
        // update links in both directions
        ref.parent = mergeTarget;
        mergeTarget.children.push(ref as any);
      });

      // If @preferred was found on the current item, update the mergeTarget's comment
      // with comment from the renaming module
      if (item.preferred) mergeTarget.comment = renaming.comment;

      // Now that all the children have been relocated to the mergeTarget, delete the empty module
      // Make sure the module being renamed doesn't have children, or they will be deleted
      if (renaming.children) renaming.children.length = 0;
      CommentPlugin.removeReflection(context.project, renaming);

      // Remove @module and @preferred from the comment, if found.
      CommentPlugin.removeTags(mergeTarget.comment, "module");
      CommentPlugin.removeTags(mergeTarget.comment, "preferred");
    });
  }
}

interface ModuleRename {
  renameTo: string;
  preferred: boolean;
  reflection: ContainerReflection;
}

interface ModuleDeclaration {
  moduleName: string;
  reflection: DeclarationReflection;
}
