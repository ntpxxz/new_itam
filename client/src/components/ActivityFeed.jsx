import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useApi } from '../hooks.js';
import { relative, fmtDateTime, fmtNum } from '../format.js';
import { ACTION_META, STOCK_META, ActionIcon } from './actions.jsx';
import { Card, Loading, Empty } from './ui.jsx';

export function FeedList({ rows }) {
  return (
        <ul className="feed">
          {rows.map((r) => {
            const meta = r.kind === 'asset' ? ACTION_META[r.action] : STOCK_META[r.action];
            const to = r.kind === 'asset' ? `/assets/${r.ref_id}` : `/consumables/${r.ref_id}`;
            return (
              <li key={`${r.kind}-${r.id}`}>
                <ActionIcon meta={meta} />
                <div className="feed-text">
                  <div>
                    <strong style={{ fontWeight: 500 }}>{meta?.label}</strong>{' '}
                    <Link to={to}>{r.item_name}</Link>
                    {r.kind === 'stock' && <> <span className="mono">{r.action === 'out' ? '−' : r.qty > 0 ? '+' : ''}{fmtNum(Math.abs(r.qty))}</span> {r.unit}</>}
                    {r.person_name && <span className="muted"> · {r.person_name}</span>}
                  </div>
                  <div className="meta" title={fmtDateTime(r.created_at)}>
                    <span className="mono">{r.code}</span> · {relative(r.created_at)}{r.by_name && ` · โดย ${r.by_name}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
  );
}

export default function ActivityFeed({ limit = 5 }) {
  const { data, loading } = useApi('/api/dashboard/activity', { limit });
  return (
    <Card title="กิจกรรมล่าสุด" noBody actions={<Link to="/activity" className="btn btn-ghost btn-sm">ดูทั้งหมด</Link>}>
      {loading && !data ? <Loading rows={limit} /> : !data?.rows.length ? <Empty icon={Activity} title="ยังไม่มีกิจกรรม" /> : <FeedList rows={data.rows} />}
    </Card>
  );
}
