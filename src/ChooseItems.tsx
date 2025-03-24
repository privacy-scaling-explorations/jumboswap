import Ctx from './Ctx';
import './ChooseItems.css';
import bufferCmp from './bufferCmp';
import YesNoPill from './YesNoPill';
import { useState } from 'react';

export default function ChooseItems() {
  const ctx = Ctx.use();
  const publicInputs = ctx.publicInputs.use();
  const pk = ctx.pk.use();

  const [choices, setChoices] = useState<('Yes' | 'No' | undefined)[]>(
    publicInputs.map(() => undefined),
  );

  if (pk === undefined) {
    return <div>Error: Public key is undefined</div>;
  }

  const partyIndex = publicInputs.findIndex(
    p => bufferCmp(p.pk.publicKey, pk.publicKey) === 0,
  );

  const ready = choices.every((c, i) => c !== undefined || i === partyIndex);

  if (partyIndex === -1) {
    console.log(pk, publicInputs);
    return <div>Error: Party not found</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className='title'>Choose Items</div>
      <div className='grow'></div>
      <p>
        Which of the following items would you be willing to trade for
        your <b>{publicInputs[partyIndex].item}</b>?
      </p>
      <div className='choice-list'>
        {publicInputs.map(({ name, item }, i) => {
          if (i === partyIndex) {
            return null;
          }

          return (
            <div key={i}>
              <div>{name}'s {item}</div>
              <YesNoPill
                onChange={value => {
                  const newChoices = [...choices];
                  newChoices[i] = value;
                  setChoices(newChoices);
                }}
              />
            </div>
          );
        })}
      </div>
      <div className='grow' />
      <button disabled={!ready}>
        {ready ? 'Submit' : 'Select yes or no for each item'}
      </button>
    </div>
  );
}
