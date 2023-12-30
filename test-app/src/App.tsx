import { DataGrid, DataModel, Row } from 'darach'
import './App.css'
import { uniqueNamesGenerator, names, animals } from 'unique-names-generator';
import { AvatarGenerator } from 'random-avatar-generator';

interface Emp {
  name: string,
  isManager: boolean,
  title: string,
  depth: number,
  imageUrl: string
}

function App() {
  const rootEmps = [
    {
      name: "Jane Americanus",
      isManager: true,
      title: "CEO",
      depth: 0,
      imageUrl: avatarGenerator.generateRandomAvatar("Jane Americanus")
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
    render: (r, c, _) => <span>{c == 0 ? renderName(r.value) : r.value.title}</span>,
    fetchChildren: async parent => (await generateRandomEmps(parent)).map(empToRow)
  }

  return (
    <>
      <DataGrid model={model} fixedToolbar={true} />
    </>
  )
}

function renderName(emp: Emp) {
  return (
    <><img className='avatar' src={emp.imageUrl} width="20" /><span>{emp.name}</span></>
  )
}

const titles = [
  "Senior Staff SWE",
  "Senior SWE",
  "SWE",
  "Principal SWE",
  "Distinguished SWE"
]

const avatarGenerator = new AvatarGenerator();

function getManagerTitle(depth: number) {
  switch (depth) {
    case 1: return "SVP";
    case 2: return "VP";
    case 3: return "Senior Director";
    case 4: return "Director";
    case 5: return "Senior Manager";
  }

  return "Manager";
}

async function generateRandomEmps(parent: Row<Emp>) {
  const maxReports = parent.value.depth == 0 ? 6 :  Math.floor((1 / parent.value.depth) * 18);

  const childCount = Math.floor(Math.random() * maxReports) + 2;
  const children = [];
  for (var i = 0; i < childCount; i++) {
    const isManager = Math.random() <= 1 / (parent.value.depth);
    const title = isManager ? getManagerTitle(parent.value.depth + 1) : titles[Math.floor(Math.random() * titles.length)];

    let surname = uniqueNamesGenerator({ dictionaries: [animals]});
    surname = surname.charAt(0).toUpperCase() + surname.substring(1);
    const name = uniqueNamesGenerator({ dictionaries: [names] }) + " " + surname;
    const imageUrl = avatarGenerator.generateRandomAvatar(name);

    children.push({
      name,
      isManager,
      title,
      depth: parent.value.depth + 1,
      imageUrl
    })
  }

  children.sort((a, b) => {
    if (a.isManager && !b.isManager) return -1;
    if (b.isManager && !a.isManager) return 1;

    return a.name.localeCompare(b.name);
  });

  return children;
}

export default App
