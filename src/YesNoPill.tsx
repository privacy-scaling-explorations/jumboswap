import { useState } from 'react';
import './YesNoPill.css';

export default function YesNoPill({
  onChange,
}: {
  onChange: (value: 'Yes' | 'No' | undefined) => void;
}) {
  const [value, setValue] = useState<'Yes' | 'No'>();

  return (
    <div className='yes-no pill'>
      <div className='pill-container'>
        {['Yes' as const, 'No' as const].map(v => (
          <div
            key={v}
            className={v === value ? 'selected' : ''}
            onClick={() => {
              const newValue = v === value ? undefined : v;
              setValue(newValue);
              onChange(newValue);
            }}
          >{v}</div>
        ))}
      </div>
    </div>
  );
}
