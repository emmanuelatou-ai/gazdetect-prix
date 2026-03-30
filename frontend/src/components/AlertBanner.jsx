import { useState, useEffect } from 'react';
import api from '../api/axios';

export default function AlertBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    api.get('/products/stats').then(({ data }) => {
      if (data.latestFile) {
        const months = (Date.now() - new Date(data.latestFile.upload_date)) / (1000 * 60 * 60 * 24 * 30);
        setShow(months > 6);
      }
    }).catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div style={{
      background: '#fff7ed',
      border: '1px solid #fed7aa',
      borderRadius: 8,
      padding: '12px 18px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13.5,
      fontWeight: 500,
      color: '#9a3412',
    }}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <span>
        Attention : le fichier prix le plus récent date de plus de 6 mois. Pensez à mettre à jour le catalogue.
      </span>
      <button
        onClick={() => setShow(false)}
        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                 color: '#9a3412', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  );
}
