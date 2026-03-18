import { useState, useEffect, useCallback } from 'react';
import type { Skill, SkillDetail } from '../types';

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/skills')
      .then((r) => r.json())
      .then(setSkills)
      .catch((err) => console.error('Failed to load skills:', err))
      .finally(() => setLoading(false));
  }, []);

  const getDetail = useCallback(async (name: string): Promise<SkillDetail> => {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`);
    return res.json();
  }, []);

  return { skills, loading, getDetail };
}
