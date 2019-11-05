import { ContainerReflection } from "typedoc/dist/lib/models/reflections/container";
import { DeclarationReflection } from "typedoc/dist/lib/models/reflections/declaration";
import { Comment } from "typedoc/dist/lib/models";
import { Context } from "typedoc/dist/lib/converter/context";
import { Reflection, ReflectionKind, ReflectionFlag } from "typedoc/dist/lib/models/reflections/abstract";
import { ModuleDeclaration } from "./moduleConverter";
import { CommentPlugin } from "typedoc/dist/lib/converter/plugins/CommentPlugin";

export class ModuleConverter {
  /** List of module reflections which are models to rename */
  private _moduleDefinitions: ModuleDefinition[];
  private _moduleDeclarations: ModuleDeclaration[];

  private _projectReflections: Reflection[];

  constructor() {
    this._moduleDefinitions = [];
    this._moduleDeclarations = [];
  }

  public get moduleDeclarations(): ModuleDeclaration[] {
    return this._moduleDeclarations;
  }

  public get moduleDefinitions(): ModuleDefinition[] {
    return this._moduleDefinitions;
  }

  public addDefinition(def: ModuleDefinition): void {
    this._moduleDefinitions.push(def);
  }

  public addDeclaration(declaration: ModuleDeclaration): void {
    this._moduleDeclarations.push(declaration);
  }

  public collectProjectReflections(context: Context): void {
    let projRefs = context.project.reflections;
    this._projectReflections = Object.keys(projRefs).reduce((m, k) => {
      m.push(projRefs[k]);
      return m;
    }, []);
  }

  public convertDeclarations(context: Context): void {
    this._moduleDeclarations.forEach(moduleDeclaration => {
      let project = context.project;
      let moduleName = moduleDeclaration.moduleName;
      let currentDeclaration = moduleDeclaration.reflection;

      // First, check to see if a top-level module already exists with this
      // declaration's module name. If so, use it.
      let moduleReflection = project.children.find(ref => ref.name === moduleName);
      if (!moduleReflection) {
        // Otherwise, check to see if a collected @moduledefinition with this
        // name already exists. If so, rename it and make it a top-level
        // module
        let modDefinitionMatch = this.moduleDefinitions.find(def => def.name === moduleName);
        if (modDefinitionMatch) {
          moduleReflection = this._createModuleFromDefinition(modDefinitionMatch, context);
        } else {
          // If there's no matching @moduledefinition, we'll have to create
          // a new module container from scratch. This should match
          // a container reflection in the original.json file.
          // The below definition isn't correct: there are some missing attributes
          // and especially the groups section doesn't get created.
          moduleReflection = new DeclarationReflection(moduleName, ReflectionKind.ExternalModule, project);
          moduleReflection.parent = project;
          moduleReflection.children = [];
          moduleReflection.setFlag(ReflectionFlag.Exported, true);
          project.reflections[moduleReflection.id] = moduleReflection;
          project.children.push(moduleReflection);
        }
      }

      this._removeFromAllContainers(context, currentDeclaration);

      currentDeclaration.parent = moduleReflection;
      moduleReflection.children.push(currentDeclaration);

      CommentPlugin.removeTags(currentDeclaration.comment, "module");
    });
  }

  private _createModuleFromDefinition(def: ModuleDefinition, context: Context): DeclarationReflection {
    let matchedReflection = this._projectReflections.find(ref => ref === def.reflection) as DeclarationReflection;

    // remove the found reflection from its previous parent
    let oldParent = matchedReflection.parent as ContainerReflection;
    let indexInContainer = oldParent.children.findIndex(child => child === matchedReflection);
    if (indexInContainer >= 0) {
      oldParent.children.splice(indexInContainer, 1);
    }

    // set the parent of the found reflection to be the project and rename
    matchedReflection.parent = context.project;
    context.project.children.push(matchedReflection);
    matchedReflection.name = def.name;
    matchedReflection.comment = def.comment;

    return matchedReflection;
  }

  private _removeFromAllContainers(context: Context, declaration: DeclarationReflection): void {
    let topLevelContainers = context.project.children;

    // Loop through these backwards since we may be changing the indices
    // during removal
    for (let i = topLevelContainers.length - 1; i >= 0; i--) {
      let container: ContainerReflection = topLevelContainers[i];
      let indexInContainer = this._findChildIndex(container.children, declaration);
      if (indexInContainer >= 0) {
        container.children.splice(indexInContainer, 1);

        if (container.children.length === 0) {
          // if the container is now empty, remove it
          CommentPlugin.removeReflection(context.project, container);

          // Also, remove it from the project's group
          let projectGroup = context.project.groups[0];
          let childIndex = this._findChildIndex(projectGroup.children as DeclarationReflection[], container);
          if (childIndex >= 0) {
            projectGroup.children.splice(childIndex, 1);
          }
        }
      }
    }
  }

  private _findChildIndex(declarations: DeclarationReflection[], toFind: Reflection): number {
    return declarations.findIndex(child => {
      // explicitly exported declarations get a "renames" property, which
      // is just a duplicate of the original declaration.
      return child.id === toFind.id || child.renames === toFind.id;
    });
  }
}

export interface ModuleDefinition {
  name: string;
  comment: Comment;
  reflection: ContainerReflection;
}

export interface ModuleDeclaration {
  moduleName: string;
  reflection: DeclarationReflection;
}
