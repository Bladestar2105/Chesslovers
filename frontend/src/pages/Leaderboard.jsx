import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function Leaderboard() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const API_URL = import.meta.env.VITE_SOCKET_URL || '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/leaderboard?federated=1`);
        if (!res.ok) throw new Error('Failed to load leaderboard');
        const data = await res.json();
        if (!cancelled) setPlayers(data.players || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error loading leaderboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [API_URL]);

  return (
    <div className="max-w-5xl mx-auto panel p-6 rounded-lg shadow-md">
      <h1 className="text-3xl font-bold mb-6">{t('Leaderboard')}</h1>
      {loading && <p>{t('Loading...')}</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)]">
                <th className="p-3">#</th>
                <th className="p-3">{t('Player')}</th>
                <th className="p-3">{t('Rating')}</th>
                <th className="p-3">{t('Games')}</th>
                <th className="p-3">W/D/L</th>
                <th className="p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.playerKey} className="border-b border-[var(--border-color)]">
                  <td className="p-3 font-bold">{p.rank}</td>
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{p.rating}</td>
                  <td className="p-3">{p.gamesPlayed}</td>
                  <td className="p-3">{p.wins}/{p.draws}/{p.losses}</td>
                  <td className="p-3 text-xs opacity-70">{p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Leaderboard;
