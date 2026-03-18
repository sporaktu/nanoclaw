import { useSystem } from '../hooks/useSystem';
import './SystemTab.css';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemTab() {
  const { status, groups, sessions, loading } = useSystem();

  if (loading && !status) return <div className="system-tab"><div className="system-loading">Loading...</div></div>;

  return (
    <div className="system-tab">
      <div className="system-cards">
        {status && (
          <div className="system-card">
            <h3>Status</h3>
            <div className="stat-grid">
              <div className="stat-item">
                <div className="stat-value">{status.activeContainers}</div>
                <div className="stat-label">Active Containers</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{status.connectedClients}</div>
                <div className="stat-label">Web Clients</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{formatUptime(status.uptime)}</div>
                <div className="stat-label">Uptime</div>
              </div>
            </div>
          </div>
        )}

        <div className="system-card">
          <h3>Registered Groups</h3>
          <table className="system-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Folder</th>
                <th>Trigger</th>
                <th>Channel</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.folder}>
                  <td>{g.name}</td>
                  <td>{g.folder}</td>
                  <td>{g.trigger}</td>
                  <td>{g.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="system-card">
          <h3>Sessions</h3>
          <table className="system-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Session ID</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(sessions).map(([group, sessionId]) => (
                <tr key={group}>
                  <td>{group}</td>
                  <td title={sessionId}>{sessionId.slice(0, 16)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
