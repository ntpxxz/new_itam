import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { api } from '../api.js';
import { Empty } from '../components/ui.jsx';

// Target of printed QR codes: /a/<ASSET_TAG>
export default function TagRedirect() {
  const { tag } = useParams();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    api.get(`/api/assets/by-tag/${encodeURIComponent(tag)}`)
      .then((d) => setState({ id: d.id }))
      .catch((e) => setState({ error: e.message }));
  }, [tag]);
  if (state.id) return <Navigate to={`/assets/${state.id}`} replace />;
  if (state.error) {
    return (
      <Empty icon={SearchX} title={`ไม่พบอุปกรณ์รหัส ${tag}`}>
        สติ๊กเกอร์อาจเป็นของระบบอื่น หรืออุปกรณ์ถูกลบแล้ว · <Link to="/scan">สแกนใหม่</Link>
      </Empty>
    );
  }
  return <div className="center-page"><div className="spinner" aria-label="กำลังค้นหา" /></div>;
}
