import { Activity } from 'lucide-react';
import { useApi, useQueryState } from '../hooks.js';
import { PageHeader, Pagination, Empty, Loading } from '../components/ui.jsx';
import { FeedList } from '../components/ActivityFeed.jsx';

export default function ActivityPage() {
  const [f, setF] = useQueryState({ page: 1 });
  const { data, loading } = useApi('/api/dashboard/activity', { page: f.page, pageSize: 30 });
  return (
    <>
      <PageHeader title="กิจกรรมล่าสุด" sub="ทุกการเคลื่อนไหวของอุปกรณ์และวัสดุสิ้นเปลือง เรียงจากล่าสุด" />
      <section className="card">
        {loading && !data ? <Loading rows={10} /> : !data?.rows.length ? <Empty icon={Activity} title="ยังไม่มีกิจกรรม" /> : <FeedList rows={data.rows} />}
        {data?.total > 0 && <Pagination page={Number(f.page)} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ page })} />}
      </section>
    </>
  );
}
