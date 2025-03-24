import './Lobby.css';
import Ctx from './Ctx';
import TitlePill from './TitlePill';

export default function Lobby() {
  const ctx = Ctx.use();
  const parties = ctx.parties.use();
  const name = ctx.name.use();
  const item = ctx.item.use();

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
          <input
            type='text'
            id='name'
            name='name'
            disabled={ready}
            value={name}
            onInput={evt => {
              const input = evt.target as HTMLInputElement;
              partyTracker.updateSelf({ name: input.value });
              ctx.name.set(input.value);
            }}
          />

          <label htmlFor='item'>Swapping item:</label>
          <input
            type='text'
            id='item'
            name='item'
            disabled={ready}
            value={item}
            onInput={evt => {
              const input = evt.target as HTMLInputElement;
              partyTracker.updateSelf({ item: input.value });
              ctx.item.set(input.value);
            }}
          />
        </form>
      </div>
      <div>
        {(() => {
          if (!ready) {
            if (name.trim() === '' || item.trim() === '') {
              return 'Enter your details';
            }

            return 'Enter your details and press "I\'m Ready"';
          }

          if (parties.length === 1) {
            return (<>
              <a
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  ctx.page.set('Invite');
                }}
              >Invite</a> at least one party
            </>);
          }

          return 'Waiting for everyone to be ready...';
        })()}
      </div>
      <div>
        <button
          className={ready ? 'secondary' : ''}
          style={{ width: '100%', lineHeight: '1.1em' }}
          onClick={() => {
            if (name.trim() === '' || item.trim() === '') {
              alert('Please enter your name and item');
              return;
            }

            partyTracker.updateSelf({ ready: !ready });
          }}
        >{ready ? 'Change Details' : 'I\'m Ready'}</button>
      </div>
    </div>
  );
}
