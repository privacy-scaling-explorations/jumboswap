import './Home.css';
import Ctx from './Ctx';
import gameDiagramSrc from './assets/GameDiagram.svg';

export default function Home() {
  const ctx = Ctx.use();

  return (
    <div className='home'>
      <div className='title'>JumboSwap</div>
      <div>
        Discover swapping opportunities using MPC.
      </div>
      <div className='main buttons'>
        <button onClick={() => ctx.page.set('Host')}>
          Host
        </button>
        <button onClick={() => ctx.page.set('Join')}>
          Join
        </button>
      </div>
      <div>
        Imagine 5 friends each have a dessert. They might prefer other desserts,
        but finding swaps that make everyone happy is difficult.
      </div>
      <img style={{ width: 'calc(0.7 * var(--aw))', alignSelf: 'center' }} src={gameDiagramSrc} />
      <div>
        Suppose you have the ice cream, but you'd rather have your friend's
        donut. If you reveal this preference, you're telling your friends that
        you think the donut is better than the ice cream. This will influence
        how they feel, which is bad for you, because in order to get what you
        want, the group has to have the opposite opinion.
      </div>
      <div>
        It's unlikely the friend with the donut happens to want your ice cream
        anyway, but suppose they want to trade for cake. If they reveal this,
        the situation is even worse - donut is better than ice cream, and cake
        is even better than donut. For you to get your donut, the person with
        cake has to think your ice cream, the dessert least preferred by others,
        is better than their cake!
      </div>
      <div>
        Suppose that, had this information not been revealed, your cake friend
        would have preferred your ice cream. But now that they know their cake
        is so coveted, they might feel justified to say something like:
      </div>
      <div className='quote'>
        Alright I'll take the ice cream ...if you give me 10 bucks!
      </div>
      <div>
        You're better off accepting an offer than making one, and that's why
        everyone is hesitant to make offers, and therefore everyone often misses
        out on mutually beneficial swaps.
      </div>
      <div className='subheading'>
        Enter JumboSwap
      </div>
      <div>
        JumboSwap uses powerful cryptography to allow everyone to discover the
        existence of these swapping cycles without revealing anything else. If
        you prefer the donut, no one will know unless you get to have the donut.
      </div>
      <div className='subheading'>How it Works</div>
      <ol style={{ margin: 0 }}>
        <li>
          <a href='#' onClick={() => {
            ctx.page.set('Share');
          }}>
            Share
          </a>
          &nbsp;this app with your friend.
        </li>
        <li>Host a session.</li>
        <li>Get your friends to join.</li>
        <li>Name the item you have.</li>
        <li>Select the items you'd prefer to have.</li>
        <li>The app will find a swap cycle if it exists.</li>
      </ol>
      <div className='subheading'>Cryptography</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7em' }}>
        <div>
          This&nbsp;
          <a href='https://github.com/voltrevo/jumboswap'>
            open source
          </a> app uses&nbsp;
          <a href='https://github.com/voltrevo/mpc-framework'>
            secure MPC
          </a> to calculate the result while keeping your input secret.
        </div>
        <div>
          Hopefully that sounds a little strange. That's because it is.
        </div>
        <div>
          The purpose of this app is to open your mind to the power of this
          counter-intuitive technology.
        </div>
      </div>
      <div className='main buttons'>
        <button onClick={() => ctx.page.set('Host')}>
          Host
        </button>
        <button onClick={() => ctx.page.set('Join')}>
          Join
        </button>
      </div>
      <div className='gutter' />
    </div>
  );
}
