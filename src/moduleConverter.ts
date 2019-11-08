import { ContainerReflection } from "typedoc/dist/lib/models/reflections/container";
import { DeclarationReflection } from "typedoc/dist/lib/models/reflections/declaration";
import { Comment, ProjectReflection } from "typedoc/dist/lib/models";
import { Context } from "typedoc/dist/lib/converter/context";
import { Reflection, ReflectionKind, ReflectionFlag } from "typedoc/dist/lib/models/reflections/abstract";
import { CommentPlugin } from "typedoc/dist/lib/converter/plugins/CommentPlugin";
import { GroupPlugin } from "typedoc/dist/lib/converter/plugins";

export class ModuleConverter {
  /** List of module reflections which are models to rename */
  private _moduleDefinitions: ModuleDefinition[];
  private _moduleDeclarations: ModuleDeclaration[];

  private _projectReflections: Reflection[];
  private _context: Context;

  constructor(context: Context) {
    this._moduleDefinitions = [];
    this._moduleDeclarations = [];
    this._context = context;
  }

  public get moduleDeclarations(): ModuleDeclaration[] {
    return this._moduleDeclarations;
  }

  public get moduleDefinitions(): ModuleDefinition[] {
    return this._moduleDefinitions;
  }

  public get _project(): ProjectReflection {
    return this._context.project;
  }

  public addDefinition(def: ModuleDefinition): void {
    this._moduleDefinitions.push(def);
  }

  public addDeclaration(declaration: ModuleDeclaration): void {
    this._moduleDeclarations.push(declaration);
  }

  public collectProjectReflections(): void {
    let projRefs = this._project.reflections;
    this._projectReflections = Object.keys(projRefs).reduce((m, k) => {
      m.push(projRefs[k]);
      return m;
    }, []);
  }

  public convertDeclarations(): void {
    this._moduleDeclarations.forEach(moduleDeclaration => {
      let project = this._project;
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
          moduleReflection = this._createModuleFromDefinition(modDefinitionMatch);
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

      this._removeDeclarationsFromOldContainers(currentDeclaration);

      this._moveDeclarationTo(currentDeclaration, moduleReflection);
    });
  }

  public removeEmptyContainer(): void {
    // Loop through these backwards since we may be changing the indices
    // during removal
    for (let i = this._project.children.length - 1; i >= 0; i--) {
      let container = this._project.children[i];
      if (container.children.length === 0) {
        this._removeReflectionFromProject(container);
      }
    }
  }

  private _createModuleFromDefinition(def: ModuleDefinition): DeclarationReflection {
    let matchedReflection = this._projectReflections.find(ref => ref === def.reflection) as DeclarationReflection;

    // remove the found reflection from its previous parent
    let oldParent = matchedReflection.parent as ContainerReflection;
    let indexInContainer = oldParent.children.findIndex(child => child === matchedReflection);
    if (indexInContainer >= 0) {
      oldParent.children.splice(indexInContainer, 1);
    }

    // set the parent of the found reflection to be the project and rename
    matchedReflection.parent = this._project;
    this._project.children.push(matchedReflection);
    matchedReflection.name = def.name;

    // Set the extracted comment to the reflection if it's not empty
    if (def.comment.shortText != null && def.comment.shortText.trim().length > 0) {
      matchedReflection.comment = def.comment;
    }

    return matchedReflection;
  }

  private _removeDeclarationsFromOldContainers(declaration: DeclarationReflection): void {
    let topLevelContainers = this._project.children;

    topLevelContainers.forEach((container: ContainerReflection) => {
      let indexInContainer = this._findChildIndex(container.children, declaration);
      if (indexInContainer >= 0) {
        container.children.splice(indexInContainer, 1);
      }
    });
  }

  private _findChildIndex(declarations: DeclarationReflection[], toFind: Reflection): number {
    return declarations.findIndex(child => {
      // explicitly exported declarations get a "renames" property, which
      // is just a duplicate of the original declaration.
      return child.id === toFind.id || child.renames === toFind.id;
    });
  }

  private _moveDeclarationTo(declaration: DeclarationReflection, newContainer: ContainerReflection): void {
    declaration.parent = newContainer;
    newContainer.children.push(declaration);

    // Make sure that this declaration is in one of the container's groups

    if (!newContainer.groups) {
      newContainer.groups = [];
    }

    let containerGroup = newContainer.groups.find(g => g.kind === declaration.kind);
    if (containerGroup) {
      // Find any grouped declarations that were just pointers to this one,
      // and replace the pointer with the original
      let pointerIndex = containerGroup.children.findIndex(
        (child: DeclarationReflection) => child.renames === declaration.id
      );
      if (pointerIndex >= 0) {
        containerGroup.children.splice(pointerIndex, 1, declaration);
      } else {
        // If this declaration isn't yet in the group, add it
        let isInGroup = containerGroup.children.some(c => c.id === declaration.id);
        if (!isInGroup) {
          containerGroup.children.push(declaration);
        }
      }
    } else {
      // Create a new group with this declaration in it.
      containerGroup = GroupPlugin.getReflectionGroups([declaration])[0];
      newContainer.groups.push(containerGroup);
    }
  }

  private _removeReflectionFromProject(container: ContainerReflection): void {
    // if the container is now empty, remove it from the project
    CommentPlugin.removeReflection(this._project, container);

    // Also, remove it from the project's group
    let projectGroup = this._project.groups[0];
    let childIndex = this._findChildIndex(projectGroup.children as DeclarationReflection[], container);
    if (childIndex >= 0) {
      projectGroup.children.splice(childIndex, 1);
    }
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
