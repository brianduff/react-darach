import { DataGrid, DataModel } from 'darach'
import './App.css'

function App() {
  interface Emp {
    name: string,
    isManager: boolean,
    title: string
  }

  const rootEmps = [
    {
      name: "Jane",
      isManager: true,
      title: "CEO"
    }
  ]

  const childEmps = [
    {
      name: "Joe",
      isManager: false,
      title: "Senior Pleb Engineer"
    }
  ]

  const empToRow = (e: Emp) => ({
    key: e.name,
    value: e,
    expandable: e.isManager
  })

  const model : DataModel<Emp> = {
    columns: [{
      name: "Name",
    },
    {
      name: "Title"
    }],
    rows: rootEmps.map(empToRow),
    render: (r, c, h) => <span>{c == 0 ? r.value.name : r.value.title}</span>,
    fetchChildren: async r => childEmps.map(empToRow)
  }

  return (
    <>
      <DataGrid model={model} />
    </>
  )
}

export default App
