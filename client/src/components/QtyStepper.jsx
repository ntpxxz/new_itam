import { Minus, Plus } from 'lucide-react';

export default function QtyStepper({ value, max, unit, label, onChange }) {
  return (
    <div className="qty-stepper">
      <button className="icon-btn" onClick={() => onChange(value - 1)} aria-label={`ลดจำนวน ${label}`}><Minus size={14} /></button>
      <input type="number" min="0" max={max} inputMode="numeric" className="input mono" value={value} aria-label={`จำนวน ${label}`}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
      <button className="icon-btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`เพิ่มจำนวน ${label}`}><Plus size={14} /></button>
      {unit && <span className="cell-sub">{unit}</span>}
    </div>
  );
}
