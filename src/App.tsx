import { css } from '@emotion/react'
import './App.css'
import { DataGrid, DataModel } from './DataGrid'

function App() {

  interface Person {
    name: string,
    isManager: boolean,
  }


  // const render = (row : Row<Vehicle>, column: number, hints: RenderHints) => <span>Hi</span>;

  const model : DataModel<Person> = {
    columns: [
      {
        name: "Type"
      }
    ],
    rows: [
      {
        key: "1",
        value: { name: "Billy Bossman", isManager: true },
        expandable: true
      }
    ],
    render: (r, _1, _2) => <span css={css`color: red`}>{r.value.name}</span>,
    fetchChildren: async _ => [
      {
        key: "2",
        value: {
          name: "Billy bob",
          isManager: false
        }
      }
    ]
  }

  return (
    <>
      <DataGrid model={model} />
    </>
  )
}

export default App
