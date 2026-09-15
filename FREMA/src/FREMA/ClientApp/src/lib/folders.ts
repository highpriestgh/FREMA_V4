export interface Folder {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  /** Documents directly in this folder that the current user can see. */
  documentCount: number;
  children: Folder[];
}

export interface FlatFolder {
  id: string;
  name: string;
  depth: number;
  /** "Finance / Invoices / 2026" — for pickers, where indentation alone is easy to misread. */
  path: string;
}

/** Depth-first flattening, keeping tree order, for use in <select> pickers. */
export function flattenFolders(tree: Folder[], depth = 0, parentPath = ""): FlatFolder[] {
  return tree.flatMap((folder) => {
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    return [
      { id: folder.id, name: folder.name, depth, path },
      ...flattenFolders(folder.children, depth + 1, path),
    ];
  });
}
