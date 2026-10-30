import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, X, Send, Save, Laptop, Package, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate, fmtMoney, fmtNum, who } from '../format.js';

const EXAMPLES = ['รับเข้า เมาส์ M101 1 ชิ้น', 'เบิก สาย LAN 2 เส้น ให้แผนกบัญชี', 'ยืม NB-2026-00012 ให้สมชาย คืน อีก 7 วัน', 'วิธีใช้'];

const docLabel = (d) => (d.type === 'receive' ? 'ใบรับเข้า' : d.mode === 'borrow' ? 'ใบยืม' : 'ใบเบิก');

function slipBody(d) {
  const { type, ...rest } = d;
  return rest;
}

function DraftCard({ draft, state, onSave, onCancel }) {
  const total = draft.type === 'receive' ? draft.lines.reduce((s, l) => s + (l.qty || 0) * (Number(l.unit_cost) || 0), 0) : 0;
  return (
    <div className="ai-draft">
      <div className="ai-draft-head">
        <strong>ร่าง{docLabel(draft)}</strong>
        <span className="cell-sub">วันที่ {fmtDate(draft.doc_date)}</span>
      </div>
      {draft.type === 'issue' && (
        <div className="cell-sub">
          ผู้รับ: {who(draft.person_name, draft.department_name)}{draft.person_name && draft.department_name && ` · ${draft.department_name}`}
          {draft.due_date && ` · คืน ${fmtDate(draft.due_date)}`}
        </div>
      )}
      <ul className="ai-draft-lines">
        {draft.lines.map((l, i) => (
          <li key={i}>
            <span className="thumb" style={{ width: 26, height: 26 }}>{l.kind === 'asset' ? <Laptop size={13} /> : <Package size={13} />}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="cell-main" style={{ display: 'block' }}>{l.name}</span>
              <span className="tag">
                {l.code}
                {l.kind === 'consumable' && ` · คงเหลือ ${fmtNum(l.qty_on_hand)}`}
                {l.unit_cost != null && ` · ${fmtMoney(l.unit_cost)}/${l.unit}`}
              </span>
            </span>
            <span className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtNum(l.qty)} {l.unit || 'ชิ้น'}</span>
          </li>
        ))}
      </ul>
      {total > 0 && <div className="cell-sub" style={{ textAlign: 'right' }}>มูลค่ารวม <span className="mono">{fmtMoney(total)}</span></div>}
      {state.saved ? (
        <div className="ai-draft-done">บันทึกแล้ว <Link to={`/documents/${state.saved.id}`} className="mono">{state.saved.doc_no}</Link></div>
      ) : state.cancelled ? (
        <div className="cell-sub">ยกเลิกร่างนี้แล้ว</div>
      ) : (
        <div className="ai-draft-actions">
          <button className="btn btn-sm" onClick={onCancel} disabled={state.busy}>ยกเลิก</button>
          <button className="btn btn-sm ai-save" onClick={onSave} disabled={state.busy}><Save size={14} />{state.busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
        </div>
      )}
      {state.error && <div className="field-error" role="alert">{state.error}</div>}
    </div>
  );
}

export default function AssistantChat() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]); // { role, text, draft?, draftState?, choices?, error? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const allowed = can('asset.create') || can('consumable.move') || can('asset.transact');

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [items, busy]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!allowed) return null;

  const patchDraft = (idx, p) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, draftState: { ...x.draftState, ...p } } : x)));

  const send = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setItems((xs) => [...xs, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.post('/api/assistant/chat', { message: text });
      setItems((xs) => [...xs, { role: 'assistant', text: res.reply, draft: res.draft, draftState: {}, choices: res.choices }]);
    } catch (e) {
      setItems((xs) => [...xs, { role: 'assistant', text: e.message, error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const save = async (idx) => {
    const d = items[idx].draft;
    patchDraft(idx, { busy: true, error: null });
    try {
      const r = await api.post(`/api/documents/${d.type}`, slipBody(d));
      patchDraft(idx, { busy: false, saved: r });
    } catch (e) {
      patchDraft(idx, { busy: false, error: e.message });
    }
  };

  const reset = () => { setItems([]); setInput(''); inputRef.current?.focus(); };

  return (
    <>
      {!open && (
        <button className="ai-fab" onClick={() => setOpen(true)} aria-label="เปิดผู้ช่วยบันทึกรายการ" title="ผู้ช่วยบันทึกรายการ">
          <Bot size={22} />
        </button>
      )}
      {open && (
        <section className="ai-panel" role="dialog" aria-label="ผู้ช่วยบันทึกรายการ">
          <header className="ai-head">
            <Bot size={18} aria-hidden />
            <div style={{ flex: 1 }}>
              <div className="ai-title">ผู้ช่วยบันทึกรายการ</div>
              <div className="cell-sub">พิมพ์สิ่งที่ต้องการรับเข้า/เบิก/ยืม ระบบจะร่างใบให้ตรวจก่อนบันทึก</div>
            </div>
            {items.length > 0 && <button className="icon-btn plain" onClick={reset} aria-label="ล้างบทสนทนา" title="ล้าง"><RotateCcw size={16} /></button>}
            <button className="icon-btn plain" onClick={() => setOpen(false)} aria-label="ปิดผู้ช่วย"><X size={18} /></button>
          </header>

          <div className="ai-list" ref={listRef} aria-live="polite">
            {!items.length && (
              <div className="ai-empty">
                <p className="cell-sub">ตัวอย่าง — กดเพื่อลองได้เลย</p>
                {EXAMPLES.map((x) => <button key={x} className="ai-example" onClick={() => send(x)}>{x}</button>)}
              </div>
            )}
            {items.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}${m.error ? ' error' : ''}`}>
                {m.text && <div className="ai-bubble">{m.text}</div>}
                {m.choices?.length > 0 && (
                  <div className="ai-empty">
                    {m.choices.map((c) => <button key={c.command} className="ai-example" onClick={() => send(c.command)} disabled={busy}>{c.label}</button>)}
                  </div>
                )}
                {m.draft && <DraftCard draft={m.draft} state={m.draftState} onSave={() => save(i)} onCancel={() => patchDraft(i, { cancelled: true })} />}
              </div>
            ))}
            {busy && <div className="ai-msg assistant"><div className="ai-bubble ai-typing" aria-label="กำลังประมวลผล"><span /><span /><span /></div></div>}
          </div>

          <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea ref={inputRef} className="textarea" rows={2} value={input} maxLength={1000} placeholder="เช่น รับเข้า เมาส์ M101 1 ชิ้น"
              onChange={(e) => setInput(e.target.value)} aria-label="ข้อความถึงผู้ช่วย"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <button className="icon-btn" type="submit" disabled={busy || !input.trim()} aria-label="ส่งข้อความ"><Send size={16} /></button>
          </form>
        </section>
      )}
    </>
  );
}
