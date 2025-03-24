import Ctx from './Ctx';
import './TitlePill.css';

export default function TitlePill() {
  const ctx = Ctx.use();
  const page = ctx.page.use();

  return (
    <div className='title pill'>
      <div className='block-container'>
        <div className='pill-container'>
          {['Invite' as const, 'Lobby' as const].map(name => (
            <div
              key={name}
              className={page === name ? 'selected' : ''}
              onClick={() => ctx.page.set(name)}
            >{name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
