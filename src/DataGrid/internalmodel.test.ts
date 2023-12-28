import { LoadingState, Model } from "./internalmodel";

class StringValue {
  key: string;

  constructor(v: string) {
    this.key = v;
  }
}

describe('Model', () => {
  test('initial model has root', async () => {
    expect(Model.create().root).toBeDefined();
  })

  test('the root node starts in the loading state', async () => {
    const model = Model.create();
    const rootNode = model.root;
    expect(rootNode.loadingState).toBe(LoadingState.Loaded);
  })

  test('add a child node', async () => {
    const model = Model.create<StringValue>();
    const newModel = model.addChild(model.root, new StringValue("Hello world!"));

    // The old model shouldn't be affected
    expect(model.getAllNodes().length).toBe(1);
    expect(newModel.getAllNodes().length).toBe(2);
  })

  test('changing loading state requires commit', async () => {
    let model = Model.create<StringValue>();

    model = model.addChild(model.root, new StringValue("Child of root"))

    let childNode = model.get(model.root.childIds[0]);
    let newChildNode = childNode.setLoadingState(LoadingState.Loading);

    expect(childNode.loadingState).toBe(LoadingState.NotLoaded);
    expect(newChildNode.loadingState).toBe(LoadingState.Loading);
  });

  test('upsert', async () => {
    let model = Model.create<StringValue>();

    model = model.addChild(model.root, new StringValue("Child of root"));
    model = model.addChild(model.root, new StringValue("Another child of root"));

    let child1 = model.get(model.root.childIds[0]);
    let id1 = child1.key;
    let child2 = model.get(model.root.childIds[1]);
    let id2 = child2.key;

    model = model.upsert(child1.setLoadingState(LoadingState.Loading));
    model = model.upsert(child2.setLoadingState(LoadingState.Loaded));

    expect(model.get(id1).loadingState).toBe(LoadingState.Loading);
    expect(model.get(id2).loadingState).toBe(LoadingState.Loaded);
  });
})