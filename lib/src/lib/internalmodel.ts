function clone<T>(orig: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(orig)), orig)
}

export type KeyType = string | number;

export interface HasKey {
  key: KeyType
}

export class Model<T extends HasKey> {
  private readonly nodes: { [key: KeyType]: Node<T> } = {};
  private readonly rootId: KeyType;

  private constructor(rootId: KeyType, nodes: { [key: KeyType]: Node<T> }) {
    this.rootId = rootId;
    this.nodes = {...nodes};
  }

  static create<T extends HasKey>() {
    const rootNode = Node.createNew<T>(null, "root", -1).setLoadingState(LoadingState.Loaded).setIsExpanded(true);
    const nodes : Record<KeyType, Node<T>> = {};
    nodes[rootNode.key] = rootNode;
    return new Model<T>(rootNode.key, nodes);
  }

  get root() {
    return this.nodes[this.rootId];
  }

  get(id: KeyType): Node<T> {
    return this.nodes[id];
  }

  getAllNodes() {
    return Object.values(this.nodes);
  }

  /// Updates (or inserts) a node.
  upsert(node: Node<T>) {
    let newNodes = {...this.nodes};
    newNodes[node.key] = node;
    return new Model(this.rootId, newNodes);
  }

  addChild(parent: Node<T>, child: T) {
    if (parent.childIds.includes(child.key)) return this;

    let newChild = Node.createNew(child, parent.key, parent.depth + 1);
//    console.log(`Created new child with id ${newChild.key}`, child);
    let newParent = parent.addChild(newChild);

    let newNodes = {...this.nodes};
    newNodes[newChild.key] = newChild;
    newNodes[newParent.key] = newParent;

    return new Model(this.rootId, newNodes);
  }

  addChildren(parent: Node<T>, children: T[]) {
    let model : Model<T> = this;
    let parentId = parent.key;
    children.forEach(child => model = model.addChild(model.get(parentId), child));

    return model;
  }
}

export enum LoadingState {
  NotLoaded,
  LoadRequested,
  Loading,
  Loaded
}

export class Node<T extends HasKey> {
  readonly parentId: KeyType;
  readonly row: T | null;
  private _loadingState: LoadingState = LoadingState.NotLoaded;
  private _isExpanded: boolean = false;
  readonly depth: number = 0;
  private _childIds: KeyType[] = [];
  private _shouldScroll: boolean | null = null;

  constructor(row: T | null, parentId: KeyType, depth: number) {
    this.parentId = parentId;
    this.depth = depth;
    this.row = row;
  }

  static createNew<T extends HasKey>(row: T | null, parentId: KeyType, depth: number) {
    return new Node<T>(row, parentId, depth);
  }

  get isRoot() {
    return this.key === this.parentId;
  }

  addChild(node: Node<T>) {
    let newModel = clone(this);
    let newChildren = [...this._childIds, node.row!.key];
    newModel._childIds = newChildren;

    return newModel;
  }

  get key() {
    if (!this.row) {
      return "root"
    } else {
      return this.row.key;
    }
  }

  get childIds() {
    return [...this._childIds];
  }

  setLoadingState(loadingState: LoadingState) {
    let newModel = clone(this);
    newModel._loadingState = loadingState;
    return newModel;
  }

  get loadingState() {
    return this._loadingState;
  }

  setIsExpanded(expanded: boolean) {
    let newModel = clone(this);
    newModel._isExpanded = expanded;
    return newModel;
  }

  get isExpanded() {
    return this._isExpanded;
  }

  setShouldScroll(shouldScroll: boolean) {
    let newModel = clone(this);
    newModel._shouldScroll = shouldScroll;
    return newModel;
  }

  get shouldScroll() {
    return this._shouldScroll;
  }
}
