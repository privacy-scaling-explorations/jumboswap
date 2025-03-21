import CopyToClipboard from 'react-copy-to-clipboard';
import Ctx from './Ctx';
import { QRCodeCanvas } from 'qrcode.react';

export default function Invite() {
  const ctx = Ctx.use();
  const roomCode = ctx.roomCode.use();
  const parties = ctx.parties.use();

  return (
    <div>
      <h1>Invite</h1>
      <p>
        Party size: {parties.length}{parties.length === 1 ? ' (just you)' : ''}
      </p>
      <p>
        Get your friends to scan:
      </p>
      <center>
        <QRCodeCanvas
          style={{ width: '100%', height: 'auto' }}
          bgColor='transparent'
          value={`${window.location.origin}${window.location.pathname}#${roomCode}`}
        />
      </center>
      <p>
        Or <CopyToClipboard text={roomCode}>
          <button style={{ padding: '0.5rem' }}>copy</button>
        </CopyToClipboard> it and send.
      </p>
      <div className='main buttons'>
        <button onClick={() => {
          ctx.page.set('Lobby');
        }}>View Lobby</button>
      </div>
    </div>
  );
}
