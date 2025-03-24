import Ctx from './Ctx';

export default function Waiting() {
  const ctx = Ctx.use();
  const readyFlags = ctx.readyFlags.use() ?? [];
  const publicInputs = ctx.publicInputs.use() ?? [];

  const waitingNames = readyFlags
    .map((ready, i) => ready ? undefined : publicInputs[i].name)
    .filter(notUndefined);

  return <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div className='grow' />
    <div>
      <center>Waiting on {waitingNames.join(', ')}</center>
    </div>
    <div className='grow' />
  </div>;
}

function notUndefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}
