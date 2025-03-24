import './Lobby.css';
import Ctx from './Ctx';
import TitlePill from './TitlePill';

export default function Lobby() {
  const ctx = Ctx.use();
  const mode = ctx.mode.use();
  const parties = ctx.parties.use();

  const { partyTracker } = ctx;

  if (!partyTracker) {
    return <div>Error: Party tracker is undefined</div>;
  }

  const { ready } = partyTracker.getSelf();

  return (
    <div className='lobby-page' style={{ WebkitTapHighlightColor: 'transparent' }}>
      <TitlePill />
      <div className='parties'>
        <div className='th-cell'>Name</div>
        <div className='th-cell'>Item</div>
        <div className='th-cell ping-cell'>Ping</div>
        <div className='th-cell'></div>
        {parties.map((party, i) => (
          <>
            <div key={100 * i + 0}>{party.name}</div>
            <div key={100 * i + 1}>{party.item}</div>
            <div className='ping-cell' key={100 * i + 3}>{party.ping}{party.ping === undefined ? '' : 'ms'}</div>
            <div className='ready-cell' key={100 * i + 2} style={{ transform: party.ready ? '' : 'scaleX(-1)' }}>{party.ready ? '✅' : '✏️'}</div>
          </>
        ))}
      </div>
      <div className='grow' />
      <div>
        <form className='form-grid'>
          <label htmlFor='name'>Your name:</label>
          <input type='text' id='name' name='name' disabled={ready} onInput={evt => {
            const input = evt.target as HTMLInputElement;
            partyTracker.updateSelf({ name: input.value });
          }} />

          <label htmlFor='item'>Swapping item:</label>
          <input type='text' id='item' name='item' disabled={ready} onInput={evt => {
            const input = evt.target as HTMLInputElement;
            partyTracker.updateSelf({ item: input.value });
          }} />
        </form>
      </div>
      <div>
        {ready
          ? 'Waiting for everyone to be ready...'
          : 'Enter your details and press "I\'m Ready"'
        }
      </div>
      <div>
        <button
          className={ready ? 'secondary' : ''}
          style={{ width: '100%', lineHeight: '1.1em' }}
          onClick={() => {
            partyTracker.updateSelf({ ready: !ready });
          }}
        >{ready ? 'Change Details' : 'I\'m Ready'}</button>
      </div>
    </div>
  );
}
