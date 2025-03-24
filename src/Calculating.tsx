import Ctx from './Ctx';
import ProgressBar from './ProgressBar';

export default function Calculating() {
  const ctx = Ctx.use();
  const mpcProgress = ctx.mpcProgress.use();

  return <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div className='grow' />
    <div>Calculating...</div>
    <ProgressBar progress={mpcProgress} />
    <div className='grow' />
  </div>;
}
