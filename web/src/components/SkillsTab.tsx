import { useState, useEffect } from 'react';
import { useSkills } from '../hooks/useSkills';
import type { SkillDetail } from '../types';
import './SkillsTab.css';

export default function SkillsTab() {
  const { skills, loading, getDetail } = useSkills();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);

  useEffect(() => {
    if (!selectedName) { setDetail(null); return; }
    getDetail(selectedName).then(setDetail).catch(() => setDetail(null));
  }, [selectedName, getDetail]);

  return (
    <div className="skills-tab">
      <div className="skills-list-panel">
        <div className="skills-list-header">Skills</div>
        <div className="skills-list-items">
          {skills.map((s) => (
            <button
              key={s.name}
              className={`skill-item ${s.name === selectedName ? 'active' : ''}`}
              onClick={() => setSelectedName(s.name)}
            >
              <span className="skill-item-name">{s.name}</span>
              <span className="skill-item-desc">{s.description}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="skills-detail-panel">
        {detail ? (
          <div className="skill-detail">
            <h3>{detail.name}</h3>
            {detail.files.length > 0 && (
              <div className="skill-files">
                <h4>Files</h4>
                <ul>
                  {detail.files.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
            <pre className="skill-content">{detail.content}</pre>
          </div>
        ) : (
          <div className="skills-placeholder">
            {loading ? 'Loading...' : 'Select a skill to view details'}
          </div>
        )}
      </div>
    </div>
  );
}
