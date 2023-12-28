import { Button, ButtonGroup, ControlGroup, Divider, Icon, InputGroup, Spinner } from '@blueprintjs/core'
import { css } from '@emotion/react'
import { useEffect, useRef, useState } from 'react'
import { LoadingState, Model, Node, KeyType } from './internalmodel'

export interface Column {
  name: string,
  maxWidthPx?: number,
  elideOverflow?: boolean,
  noWrap?: boolean
}

export interface Row<T, K extends KeyType = string> {
  key: K
  value: T
  expandable?: boolean
  matchesSearch?: (searchText: string) => boolean
}

export interface RenderHints {
  isSearchMatch?: boolean,
  isSelectedSearchMatch?: boolean,
  searchText?: string
}

export interface DataModel<T> {
  columns: Column[]
  rows: Row<T>[]
  render: (row: Row<T>, column: number, hints?: RenderHints) => JSX.Element | undefined
  fetchChildren?: (row: Row<T>) => Promise<Row<T>[] | undefined>
  toString?: (row: Row<T>, column: number) => string
}


interface SearchState {
  searchText: string,
  searchChanged: boolean,
  searchStarted: boolean,
  searchQueue: KeyType[],
  startTime: number,
  matches: KeyType[],
  selectedResultIdx?: number
}

let operationId = 0;

interface Props<T> {
  model: DataModel<T>,
  fixedToolbar?: boolean
}
export function DataGrid<T>({ model, fixedToolbar } : Props<T>) {

  let initialModel = Model.create<Row<T>>();
  for (const row of model.rows) {
    initialModel = initialModel.addChild(initialModel.root, row);
  }

  const [internalModel, setInternalModelImpl] = useState<Model<Row<T>>>(initialModel);
  const [searchState, setSearchState] = useState<SearchState>({ searchText: "", searchChanged: false, searchStarted: false, searchQueue: [], startTime: 0, matches: []});
  const [operations, setOperations] = useState<Operation<any>[]>([]);

  function setInternalModel(model: Model<Row<T>>) {
    console.log("Set model to ", model);
    setInternalModelImpl(model);
  }

  function commitNode(node: Node<Row<T>>, model?: Model<Row<T>>, ) {
    if (model === undefined) {
      model = internalModel;
    }
    setInternalModel(model.upsert(node));
  }

  function toString(row: Row<T>, column: number) {
    if (model.toString !== undefined) {
      return model.toString(row, column);
    }
    return `Some row without a toString()`
  }

  function enqueueOperation(op: Operation<any>) {
    setOperations([...operations, op]);
  }

  function updateOperation(op: Operation<any>) {
    const newOperations = [...operations];
    for (var i = 0; i < newOperations.length; i++) {
      if (newOperations[i].id === op.id) {
        newOperations[i] = op;
        console.log("Replaced operation!")
        break;
      }
    }
    setOperations(newOperations);
    return newOperations;
  }


  class Operation<S> {
    readonly id: number;
    readonly isDone: boolean;
    readonly state: S;
    readonly update: (op: Operation<S>) => Operation<S>

    private constructor(id: number, isDone: boolean, state: S, update: (op: Operation<S>) => Operation<S>) {
      this.id = id;
      this.isDone = isDone;
      this.state = state;
      this.update = update;
    }

    static enqueue<ST>(state: ST, update: (op: Operation<ST>) => Operation<ST>) {
      let op = new Operation<ST>(operationId++, false, state, update);
      enqueueOperation(op);
      return op;
    }

    markDone() {
      let newOp = new Operation<S>(this.id, true, this.state, this.update);
      updateOperation(newOp);
      return newOp;
    }

    updateState(newState: S) {
      let newOp = new Operation<S>(this.id, this.isDone, {...newState}, this.update);
      updateOperation(newOp);
      return newOp;
    }
  }

  // Ensures that the given node is visible by expanding any of its parents, and scrolling.
  function ensureVisible(node: Node<Row<T>>) {
    console.log("Ensuring visible:", node);
    let model = internalModel.upsert(node.setShouldScroll(true));
    let parent = node.parentId;

    while (parent != -1) {
      let parentNode = model.get(parent);
      model = model.upsert(parentNode.setIsExpanded(true));
      parent = parentNode.parentId;
    }

    setInternalModel(model);
  }

  // Process operations
  useEffect(() => {
    // Get the top operation
    if (operations.length > 0) {
      let op = operations[0];
      if (op.isDone) {
//        console.log(`Operation ${op.id} is done. Dequeuing.`)
        const newOps = operations.slice(1);
        setOperations(newOps);
      } else {
//        console.log(`Operation ${op.id} is still in progress.`)
        const newOps = [...operations];
        const newOp = op.update(op);
        newOps[0] = newOp;
        setOperations(newOps);
      }

    }
  }, [operations, internalModel])

  // Always load the first generation of children on initial create.
  useEffect(() => {
    console.log("Loading first generation of children");
    const f = async () => {
      const rootId = internalModel.root.key;
      for (const childId of internalModel.get(rootId).childIds) {
        expand(internalModel.get(childId));
      }
    }
    f()
  }, [])

  // When the internal model changes, look for nodes that are in the loading state, and complete
  // loading them.
  useEffect(() => {
    async function load() {
      console.log("Checking for nodes that need loadin'")
      if (model.fetchChildren === undefined) return;

      // Find any nodes that are loading, and proceed to load their children.
      const nodeIdsToLoad = internalModel.getAllNodes().filter(
        node =>
        node.row?.expandable &&
        node.loadingState === LoadingState.LoadRequested);
      console.log("I will load", nodeIdsToLoad);

      // Mark each of these nodes as loading.
      let updatedModel = internalModel;
      nodeIdsToLoad.forEach(node => updatedModel = internalModel.upsert(node.setLoadingState(LoadingState.Loading)));
      setInternalModel(updatedModel);

      // Fire off loading for each of these nodes.
      for (var id of nodeIdsToLoad.map(n => n.key)) {
        let parentNode = updatedModel.get(id);
        let childRows = await model.fetchChildren(parentNode.row!);

        if (childRows !== undefined) {
          let newModel = internalModel.addChildren(parentNode, childRows);
          console.log(`Children of node ${toString(parentNode.row!, 0)} are now: ${newModel.get(id).childIds}`)
          newModel = newModel.upsert(newModel.get(id).setLoadingState(LoadingState.Loaded));
          console.log("Setting model with children");
          setInternalModel(newModel);
        }
      }
    }

    load();
  }, [internalModel])

  useEffect(() => {
    async function search() {
      console.log("Checking search state");
      if (searchState.searchChanged) {
        let rootId = internalModel.root.key;
        let searchQueue = searchState.searchText === "" ? [] : [ rootId ];
        setSearchState({...searchState, searchChanged: false, searchStarted: searchState.searchText !== "", searchQueue, startTime: new Date().getTime(), matches: [], selectedResultIdx: undefined })
      }

      if (searchState.searchQueue.length > 0 && searchState.searchText !== "") {
        let node = internalModel.get(searchState.searchQueue[0]);
        if (node.loadingState !== LoadingState.Loading) { // Wait until loading settles.
          if (node.loadingState === LoadingState.NotLoaded) {
            loadChildren(node);
          } else {
            // Throw the children of the node on the queue.
            const newQueue = searchState.searchQueue.slice(1);
            const newMatches = [...searchState.matches];
            let newSelectedResult = searchState.selectedResultIdx;
            for (var child of node.childIds) {
              let childNode = internalModel.get(child);
              if (childNode.row?.matchesSearch && childNode.row?.matchesSearch(searchState.searchText)) {
                newMatches.push(childNode.key);
                if (newSelectedResult === undefined) {
                  newSelectedResult = 0;
                  ensureVisible(childNode);
                }
                console.log("Match found: ", childNode);
              }
              if (childNode.row?.expandable) {
                newQueue.push(childNode.key);
              }
            }
            setSearchState({...searchState, searchQueue: newQueue, matches: newMatches, selectedResultIdx: newSelectedResult});
          }
        }
      }
    }
    search();
  }, [searchState, internalModel])

  // Load children without changing the expansion state.
  function loadChildren(node: Node<Row<T>>) {
    console.log("Requesting to load children of ", node);
    if (node.loadingState === LoadingState.NotLoaded && model.fetchChildren !== undefined) {
      commitNode(node.setLoadingState(LoadingState.LoadRequested));
    }
  }

  function expand(node: Node<Row<T>>) {
    console.log("Expanding ", node)
    let newNode = node.setIsExpanded(true);
    if (node.loadingState === LoadingState.NotLoaded && model.fetchChildren !== undefined) {
      newNode = newNode.setLoadingState(LoadingState.LoadRequested);
    }
    commitNode(newNode);
  };

  function collapse(node: Node<Row<T>>) {
    console.log("Collapsing ", node);
    commitNode(node.setIsExpanded(false));
  }

  function setSearchText(value: string) {
    const newState = {...searchState};
    newState.searchText = value;
    newState.searchChanged = true;
    setSearchState(newState);
  }

  let searchSpinner = <span></span>;
  let elapsedS = (searchState.startTime > 0 ? new Date().getTime() - searchState.startTime : 0) / 1000;
  if (searchState.searchQueue.length > 0 && elapsedS > 1) {
    searchSpinner = <Spinner size={15} />
  }

  let resultCount = undefined;
  if (searchState.selectedResultIdx !== undefined && searchState.matches.length > 0) {
    resultCount = <div css={css`margin: 6px; font-size: 13px;`}>{searchState.selectedResultIdx + 1}/{searchState.matches.length}</div>
  }

  const clearSearch = () => {
    const newSearchState = {...searchState, searchText: "", searchChanged: true };
    setSearchState(newSearchState);
  }

  const nextResult = () => {
    console.log("Next result ", searchState);
    if (searchState.selectedResultIdx !== undefined && searchState.selectedResultIdx < searchState.matches.length - 1) {
      const newSearchState = {...searchState, selectedResultIdx: searchState.selectedResultIdx + 1 }
      setSearchState(newSearchState);
      ensureVisible(internalModel.get(searchState.matches[searchState.selectedResultIdx]));
    }
  }

  const prevResult = () => {
    if (searchState.selectedResultIdx !== undefined && searchState.selectedResultIdx > 0) {
      const newSearchState = {...searchState, selectedResultIdx: searchState.selectedResultIdx - 1 }
      setSearchState(newSearchState);
      ensureVisible(internalModel.get(searchState.matches[searchState.selectedResultIdx]));
    }
  }

  async function expandAll() {
    console.log("Expand all");
    interface ExpandAllState {
      loadingIds: Set<KeyType>
      startTime: number
    }

    Operation.enqueue<ExpandAllState>({ loadingIds: new Set([internalModel.root.key]), startTime: new Date().getTime() }, op => {
      if (op.state.loadingIds.size === 0) {
        console.log("No more expanding nodes. Marking operation as done");
        return op.markDone();
      }

      if ((new Date().getTime() - op.state.startTime) > 5000) {
        console.log("Expanding for > 5s. Bailing.");
        return op.markDone();
      }

      const loading = new Set<KeyType>(op.state.loadingIds);

      // Find any nodes that have already finished loading and remove them.
      const loadedIds = new Array(...loading).map(k => internalModel.get(k)).filter(v => v.loadingState === LoadingState.Loaded).map(n => n.key);
//      console.log("EA: Loading complete for ", loadedIds);
      loadedIds.forEach(id => loading.delete(id));

      // Add all reachable nodes that need to be loaded.
      const needToLoad = internalModel.getAllNodes().filter(n =>
          n.row?.expandable && !loading.has(n.key) && n.loadingState === LoadingState.NotLoaded);
//      console.log("EA: begin waiting for load for ", needToLoad);
      needToLoad.map(n => n.key).forEach(id => loading.add(id))


      console.log(`EA: Still waiting to load ${loading.size} nodes`)

      // Request load for all needToLoad nodes.
      let model = internalModel;
      needToLoad.forEach(n => model = model.upsert(n.setLoadingState(LoadingState.LoadRequested)));
      setInternalModel(model);

      if (loading.size === 0) {
        return op.markDone();
      } else {
        return op.updateState({ loadingIds: loading, startTime: op.state.startTime });
      }

//      console.log("Nodes that need to be loaded:", needToLoad);
//       for (const node of internalModel.getAllNodes()) {
//         if (!loading.has(node.key) && node.row?.expandable && node.loadingState === LoadingState.NotLoaded) {
//           loading.add(node.key);
//           console.log("Requesting load of ", toString(node.row, 0))
//           loadChildren(node);
//         }
//       }

//       console.log("After phase 1, op state is ", {...op.state})

//       // Go through all nodes and dequeue any that are both expanded and loaded.
//       console.log("Checking for loaded nodes...");
//       for (var id of loading) {
//         const node = internalModel.get(id);
//         if (node.loadingState === LoadingState.Loaded) {
//  //         console.log("Dequeueing loaded node", toString(node.row!, 0));
//           loading.delete(id);
//         }
//       }

//       console.log("After phase 2, op state is ", {...op.state})


//      return op.updateState({ loadingIds: loading });
    });
  }

  function collapseAll() {

  }

  const leftElement = (
    <ButtonGroup minimal={true}>
      <Button minimal={true} icon="expand-all" title="Expand all" onClick={expandAll} />
      <Button minimal={true} icon="collapse-all" title="Collapse all" onClick={collapseAll} />
      <Button minimal={true} icon="filter" rightIcon="caret-down" title="Filter" text="All" />
      <Divider />
    </ButtonGroup>
  )

  const rightElement = (
    <ButtonGroup minimal={true}>
      {searchSpinner}
      {resultCount}
      <Divider />
      <Button minimal={true} icon="chevron-up" onClick={prevResult} />
      <Button minimal={true} icon="chevron-down" onClick={nextResult} />
      <Button minimal={true} icon="cross" onClick={clearSearch} />
    </ButtonGroup>)

  let toolbarStyle = undefined;
  let tableStyle = undefined;
  if (fixedToolbar) {
    toolbarStyle = css`
      position: fixed;
      top: 0;
      left: 0;
      z-index: 999;
      width: 100%;
      height: 32px;
      opacity: 1;
      background-color: #293742;
    `
    tableStyle = css`
      padding-top: 32px;
    `
  }

  return (
    <>
      <div css={toolbarStyle}>
        <ControlGroup fill={true} vertical={false}>
          <InputGroup placeholder='Search...' value={searchState.searchText} onChange={e => setSearchText(e.target.value)} leftElement={leftElement} rightElement={rightElement} />
        </ControlGroup>
      </div>

      <table css={tableStyle}>
        <thead>
          <tr>
            {model.columns.map((c, index) => <th key={index} css={CELL_STYLE}>{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
        {internalModel.root.childIds.map(id => (
          <RenderedRow<T> searchState={searchState} model={model} commitNode={commitNode} internalModel={internalModel} node={internalModel.get(id)} expand={expand} collapse={collapse} />
        ))}
        </tbody>
      </table>
    </>
  )
}


interface RenderedRowProps<T> {
  model: DataModel<T>,
  internalModel: Model<Row<T>>,
  commitNode: (node: Node<Row<T>>) => void,
  node: Node<Row<T>>,
  expand: (node: Node<Row<T>>) => void,
  collapse: (node: Node<Row<T>>) => void,
  searchState: SearchState
}

function RenderedRow<T>({ model, internalModel, commitNode, node, expand, collapse, searchState }: RenderedRowProps<T>) {
//  console.log(`Rendering row ${model.toString === undefined ? "" : model.toString(node.row!, 0)}`)
  const elements = [];
  const toggleExpanded = async () => {
    if (node.loadingState === LoadingState.Loading || node.loadingState === LoadingState.LoadRequested) return;

    if (node.isExpanded) {
      collapse(node);
    } else {
      expand(node);
    }
  };

  interface CellProps {
    columnIndex: number,
    renderHints: RenderHints
  }
  function Cell({ columnIndex, renderHints }: CellProps) {
//    console.log(`Rendering cell for ${model.toString == undefined ? "" : model.toString(node.row!, columnIndex)}`);
    const tdRef = useRef<HTMLTableCellElement>(null);

    useEffect(() => {
      if (tdRef.current && internalModel.get(node.key).shouldScroll) {
        window.requestAnimationFrame(() => {
          tdRef.current?.scrollIntoView();
        })

        commitNode(node.setShouldScroll(false));
      }
    }, [tdRef, internalModel])

    const anyExpandable = model.rows.find(r => r.expandable) !== undefined;

    let expander = undefined;
    let indent = undefined;
    if (columnIndex == 0) {
      if (anyExpandable) {
        expander = <Spacer size={2} />;
      }
      if (node.row!.expandable) {
        expander = node.isExpanded ? <Icon icon="chevron-down" /> : <Icon icon="chevron-right" />;
      }
      indent = <Spacer size={node.depth} />;
    }

    const BUTTON_STYLE = css`
      all: revert;
      background: inherit;
      border: none;
      text-align: inherit;
      font-size: inherit;
      font-family: inherit;
      margin: inherit;
      padding: inherit;
      cursor: pointer;
      text-rendering; inherit;
      color: inherit;
    `

    let cellComponent = <>{indent}{expander}{model.render(node.row!, columnIndex, renderHints)}</>;
    if (columnIndex == 0 && node.row!.expandable) {
      cellComponent = (<button onClick={toggleExpanded} css={BUTTON_STYLE}>{cellComponent}</button>);
    }

    const style = [
      CELL_STYLE,
    ];
    if (model.columns[columnIndex].elideOverflow) {
      style.push(STYLE_OVERFLOW_ELIDE);
    }
    if (model.columns[columnIndex].maxWidthPx) {
      style.push(styleMaxWidth(model.columns[columnIndex].maxWidthPx!))
    }
    if (model.columns[columnIndex].noWrap) {
      style.push(STYLE_NO_WRAP);
    }

    return <td ref={tdRef} key={columnIndex} css={style}>{cellComponent}</td>
  }

  for (var i = 0; i < model.columns.length; i++) {
    const isSelectedSearchMatch = searchState.selectedResultIdx !== undefined && internalModel.get(searchState.matches[searchState.selectedResultIdx])?.key == node.key;
    const renderHints : RenderHints = {
      isSearchMatch: searchState.matches.includes(node.key),
      isSelectedSearchMatch,
      searchText: searchState.searchText
    }

    elements.push(<Cell columnIndex={i} renderHints={renderHints} />);
  }

  return (
    <>
      <tr>
        {elements}
      </tr>
      {((node.loadingState === LoadingState.Loading || node.loadingState === LoadingState.LoadRequested) && node.isExpanded) && <tr><td css={CELL_STYLE}><Spacer size={3 + node.depth} />Loading...</td></tr>}
      {(node.isExpanded && node.loadingState === LoadingState.Loaded) && node.childIds.map(id => <RenderedRow<T> searchState={searchState} model={model} commitNode={commitNode} internalModel={internalModel} node={internalModel.get(id)} expand={expand} collapse={collapse} />)}
    </>
  )
}

const CELL_STYLE = css`
  text-align: left;
`;

function styleMaxWidth(maxWidthPx: number) {
  return css`
    max-width: ${maxWidthPx}px;
  `
}

const STYLE_NO_WRAP = css`white-space: nowrap`;

const STYLE_OVERFLOW_ELIDE = css`
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `
interface SpacerProps {
  size?: number
}
function Spacer({ size = 1 }: SpacerProps) {
  const style = css`
    margin-left: ${8 * size}px;
  `
  return <span css={style} />
}
