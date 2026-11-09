import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

// Typing keeps a draft so the field can be empty mid-edit; only a number ≥ 1 is committed,
// and blur restores the last value. Removing the line stays an explicit action (− at 1, or the trash button).
export default function QtyStepper({ value, max, unit, label, onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <div className="qty-stepper">
      <button className="icon-btn" onClick={() => onChange(value - 1)} aria-label={`ลดจำนวน ${label}`}><Minus size={14} /></button>
      <input type="number" min="1" max={max} inputMode="numeric" className="input mono" value={draft} aria-label={`จำนวน ${label}`}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (n > 0) onChange(n);
        }}
        onBlur={() => setDraft(String(value))} />
      <button className="icon-btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`เพิ่มจำนวน ${label}`}><Plus size={14} /></button>
      {unit && <span className="cell-sub">{unit}</span>}
    </div>
  );
}
