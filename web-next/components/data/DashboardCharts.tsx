'use client';

import { useMemo } from 'react';
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { firestoreHelpers, formatDate, useCollectionData, useCollectionCount, useUserScope } from '@/lib/firestoreHooks';
import type { DocumentData } from 'firebase/firestore';

interface WorkoutLog extends DocumentData {
  date?: any;
  completed?: boolean;
}

export default function DashboardCharts() {
  const { userId } = useUserScope();

  const workoutQuery = useMemo(() => [firestoreHelpers.orderBy('date', 'desc'), firestoreHelpers.limit(14)], []);
  const { data: workoutLogs } = useCollectionData<WorkoutLog>(['workout_logs'], workoutQuery);

  const chartData = useMemo(() => {
    const grouped = new Map<string, number>();
    workoutLogs.forEach((log) => {
      const label = formatDate(log.date);
      grouped.set(label, (grouped.get(label) ?? 0) + 1);
    });
    return Array.from(grouped.entries()).map(([day, total]) => ({ day, total })).reverse();
  }, [workoutLogs]);

  const posturalCount = useCollectionCount(['users', userId, 'avaliacaoPostural']);
  const personalizadaCount = useCollectionCount(['users', userId, 'avaliacaoPersonalizada']);
  const fisicaCount = useCollectionCount(['users', userId, 'avaliacoesFisicas']);

  const evaluationData = [
    { name: 'Postural', value: posturalCount.count },
    { name: 'Personalizada', value: personalizadaCount.count },
    { name: 'Fisica', value: fisicaCount.count },
  ];

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 24 }}>
      <div className="card">
        <h3>Treinos registrados</h3>
        <p className="subtle" style={{ marginTop: 6 }}>Ultimos 14 dias</p>
        <div style={{ width: '100%', height: 220, marginTop: 12 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <XAxis dataKey="day" hide />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke="#38b6ff" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h3>Avaliacoes por tipo</h3>
        <p className="subtle" style={{ marginTop: 6 }}>Filtro por usuario</p>
        <div style={{ width: '100%', height: 220, marginTop: 12 }}>
          <ResponsiveContainer>
            <BarChart data={evaluationData}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#002a5d" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
