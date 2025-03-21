import { useState } from 'react';
import './Lobby.css';
import Ctx from './Ctx';

export default function Lobby() {
  const ctx = Ctx.use();
  const mode = ctx.mode.use();
  const parties = ctx.parties.use();
  const [ready, setReady] = useState(false);

  return (
    <div className='lobby-page' style={{ WebkitTapHighlightColor: 'transparent' }}>
      <div className='title'>Lobby</div>
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
      <div>
        <form className='form-grid'>
          <label htmlFor='name'>Your name:</label>
          <input type='text' id='name' name='name' disabled={ready} onInput={evt => {
            const input = evt.target as HTMLInputElement;
            ctx.setName(input.value);
          }} />

          <label htmlFor='item'>Swapping item:</label>
          <input type='text' id='item' name='item' disabled={ready} onInput={evt => {
            const input = evt.target as HTMLInputElement;
            ctx.setItem(input.value);
          }} />
        </form>
      </div>
      <div>
        <button
          className='secondary'
          style={{ width: '100%', lineHeight: '1.1em' }}
          onClick={() => ctx.page.set('Invite')}
        >Invite</button>
      </div>
      <div>
        <button
          className={ready ? 'secondary' : ''}
          style={{ width: '100%', lineHeight: '1.1em' }}
          onClick={() => setReady(!ready)}
        >{ready ? 'Change Details' : 'I\'m Ready'}</button>
      </div>
      {mode === 'Host' && <>
        <div style={{ visibility: ready ? 'visible' : 'hidden', marginBottom: '3em' }}>
          <button style={{ width: '100%', lineHeight: '1.1em' }}>Start</button>
        </div>
      </>}
      {mode === 'Join' && <>
        <div style={{ visibility: ready ? 'visible' : 'hidden', marginBottom: '3em' }}>
          Waiting for host...
        </div>
      </>}
    </div>
  );
}
