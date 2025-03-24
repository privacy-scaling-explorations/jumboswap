import Ctx from './Ctx';
import './Result.css';

export default function Result() {
  const ctx = Ctx.use();
  const publicInputs = ctx.publicInputs.use();
  const result = ctx.result.use();

  return (
    <div className='result'>
      <div className='title'>Results</div>

      <div className='grow' />

      <div className='content'>
        {result.map((itemIndex, partyIndex) => {
          const { name } = publicInputs[partyIndex];
          const originalItemName = publicInputs[partyIndex].item;

          if (itemIndex === partyIndex) {
            return <div><b>{name}</b><br />&nbsp; &nbsp; Keep your <b>{originalItemName}</b>.</div>;
          }

          const otherPartyIndex = result.findIndex(i => i === partyIndex);
          const otherPartyName = publicInputs[otherPartyIndex].name;

          const newItemName = publicInputs[itemIndex].item;
          const newItemFrom = publicInputs[itemIndex].name;

          return <div>
            <b>{name}</b><br />
            &nbsp; &nbsp; Give your <b>{originalItemName}</b> to <b>{otherPartyName}</b>,<br />
            &nbsp; &nbsp; receive <b>{newItemFrom}</b>'s <b>{newItemName}</b>.
          </div>;
        })}
      </div>

      <div className='grow' />

      <button
        onClick={() => {
          window.location.reload();
        }}
      >Home</button>
    </div>
  );
}
