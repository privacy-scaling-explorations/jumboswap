import CopyToClipboard from 'react-copy-to-clipboard';
import Ctx from './Ctx';
import { QRCodeCanvas } from 'qrcode.react';
import TitlePill from './TitlePill';

const maxRecommendedPartySize = 5;

export default function Invite() {
  const ctx = Ctx.use();
  const roomCode = ctx.roomCode.use();
  const parties = ctx.parties.use();
  const partySizeWarningDismissed = ctx.partySizeWarningDismissed.use();

  const warningNeeded = parties.length >= maxRecommendedPartySize && !partySizeWarningDismissed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <TitlePill />
      <div className='grow'></div>
      <p>
        Party size: {parties.length}{parties.length === 1 ? ' (just you)' : ''}
      </p>
      <p>
        Get your friends to scan:
      </p>
      {warningNeeded && <>
        <div style={{
          width: 'var(--iaw)',
          height: 'var(--iaw)',
        }}>
          <p>
            Whoa there! Running JumboSwap with more than&nbsp;
            {maxRecommendedPartySize} parties may perform poorly. Only
            invite more people if you like to live dangerously.
          </p>
          <p>
            <a
              onClick={() => ctx.partySizeWarningDismissed.set(true)}
              style={{ cursor: 'pointer' }}
            >I like to live dangerously.</a>
          </p>
        </div>
      </>}
      {!warningNeeded && <>
        <center>
          <QRCodeCanvas
            style={{ width: '100%', height: 'auto' }}
            bgColor='transparent'
            value={`${window.location.origin}${window.location.pathname}#${roomCode}`}
          />
        </center>
      </>}
      <p style={{ visibility: warningNeeded ? 'hidden' : 'visible' }}>
        Or <CopyToClipboard text={roomCode}>
          <button style={{ padding: '0.5rem' }}>copy</button>
        </CopyToClipboard> it and send.
      </p>
      <div className='grow'></div>
      <p>
        Once your friends have joined, proceed to the&nbsp;
        <a
          style={{ cursor: 'pointer' }}
          onClick={() => {
            ctx.page.set('Lobby');
          }}
        >lobby</a>.
      </p>
    </div>
  );
}
