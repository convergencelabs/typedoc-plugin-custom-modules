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
  private _moduleDeclarations: { [reflectionId: string]: ModuleDeclaration };

  private _projectReflections: Reflection[];
  private _context: Context;

  constructor(context: Context) {
    this._moduleDefinitions = [];
    this._moduleDeclarations = {};
    this._context = context;
  }

  private get _project(): ProjectReflection {
    return this._context.project;
  }

  public addDefinition(def: ModuleDefinition): void {
    this._moduleDefinitions.push(def);
  }

  public addDeclaration(declaration: ModuleDeclaration): void {
    this._moduleDeclarations[declaration.reflection.id] = declaration;
  }

  public collectProjectReflections(): void {
    let projRefs = this._project.reflections;
    this._projectReflections = Object.keys(projRefs).reduce((m, k) => {
      m.push(projRefs[k]);
      return m;
    }, []);
  }

  public convertDeclarations(): void {
    Object.keys(this._moduleDeclarations).forEach(reflectionId => {
      let moduleDeclaration = this._moduleDeclarations[reflectionId];
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
        let modDefinitionMatch = this._moduleDefinitions.find(def => def.name === moduleName);
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

      this._removeDeclarationsFromOldContainers(currentDeclaration, moduleReflection);

      this._reparentDeclaration(currentDeclaration, moduleReflection);
    });
  }

  public removeEmptyContainers(): void {
    // Loop through these backwards since we may be changing the indices
    // during removal
    for (let i = this._project.children.length - 1; i >= 0; i--) {
      let container = this._project.children[i];
      if (container.children.length > 0) {
        this._moveUnmoduledDeclarations(container);
      }
      if (container.children.length === 0) {
        this._removeReflectionFromProject(container);
      }
    }
  }

  public sortAll(): void {
    this._sortDeclarations(this._project);
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

  private _removeDeclarationsFromOldContainers(
    declaration: DeclarationReflection,
    newContainer: ContainerReflection
  ): void {
    let topLevelContainers = this._project.children;

    topLevelContainers.forEach((container: ContainerReflection) => {
      if (container !== newContainer) {
        this._removeDeclarationFromContainer(declaration, container);
      }
    });
  }

  private _removeDeclarationFromContainer(declaration: DeclarationReflection, container: ContainerReflection): void {
    let indexInContainer = this._findChildIndex(container.children, declaration);
    if (indexInContainer >= 0) {
      container.children.splice(indexInContainer, 1);
    }

    // Also remove the declaration from any groups.
    if (container.groups) {
      let groupIndex = container.groups.findIndex(g => g.kind === declaration.kind);
      if (groupIndex >= 0) {
        let group = container.groups[groupIndex];
        let childIndex = this._findChildIndex(group.children as DeclarationReflection[], declaration);
        if (childIndex >= 0) {
          group.children.splice(childIndex, 1);

          // And delete the group if it is now empty
          if (group.children.length === 0) {
            container.groups.splice(groupIndex);
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

  private _reparentDeclaration(declaration: DeclarationReflection, newContainer: ContainerReflection): void {
    if (declaration.parent !== newContainer) {
      declaration.parent = newContainer;
      newContainer.children.push(declaration);
    }

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

  private _moveUnmoduledDeclarations(container: ContainerReflection): void {
    for (let i = container.children.length - 1; i >= 0; i--) {
      let declaration = container.children[i];
      if (!this._moduleDeclarations.hasOwnProperty(declaration.id)) {
        this._removeDeclarationFromContainer(declaration, declaration.parent as ContainerReflection);
        if (!declaration.hasOwnProperty("renames")) {
          this._reparentDeclaration(declaration, this._project);
        }
      }
    }
  }

  private _sortDeclarations(container: ContainerReflection): void {
    if (container.children) {
      container.children.forEach(declaration => {
        if (declaration instanceof ContainerReflection) {
          this._sortDeclarations(declaration);
        }
      });
      container.children.sort(GroupPlugin.sortCallback);
    }
    if (container.groups) {
      container.groups.forEach(group => {
        group.children.sort(GroupPlugin.sortCallback);
      });
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
