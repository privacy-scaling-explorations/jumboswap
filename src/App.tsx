import { useEffect } from 'react';
import Calculating from './Calculating';
import Lobby from './Lobby';
import Ctx from './Ctx';
import Error from './Error';
import Home from './Home';
import Invite from './Invite';
import Join from './Join';
import Result from './Result';
import Share from './Share';
import Waiting from './Waiting';
import isKey from './isKey';
import never from './never';
import ChooseItems from './ChooseItems';

function App() {
  const ctx = Ctx.use();
  const page = ctx.page.use();

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.hash.slice(1);

    if (isKey(code)) {
      window.location.hash = '';
      ctx.join(code);
    }
  }, [ctx]);

  let content;

  if (page === 'Home') {
    content = <Home />;
  } else if (page === 'Share') {
    content = <Share />;
  } else if (page === 'Invite') {
    content = <Invite />;
  } else if (page === 'Join') {
    content = <Join />;
  } else if (page === 'Connecting') {
    content = <h1>Connecting...</h1>;
  } else if (page === 'Lobby') {
    content = <Lobby />;
  } else if (page === 'Waiting') {
    content = <Waiting />;
  } else if (page === 'ChooseItems') {
    content = <ChooseItems />;
  } else if (page === 'Calculating') {
    content = <Calculating />;
  } else if (page === 'Result') {
    content = <Result />;
  } else if (page === 'Error') {
    content = <Error />;
  } else {
    never(page);
  }

  return content;
}

export default App;
