'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { useUserScope, formatDate } from '@/lib/firestoreHooks';
import { fetchAppointmentById, confirmAppointment, cancelAppointment } from '@/lib/services/scheduling';

export default function ScheduleDetailPage({ params }: { params: { id: string } }) {
  const { userId } = useUserScope();
  const pathname = usePathname();
  const appointmentId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'schedule' ? last : params.id;
  }, [pathname, params.id]);
  const [appointment, setAppointment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!userId) {
        setLoading(false);
        setError('Usuario nao encontrado.');
        return;
      }
      setLoading(true);
      const result = await fetchAppointmentById(appointmentId);
      if (!active) return;
      if (result.data) {
        setAppointment(result.data);
      } else {
        setError(result.error || 'Horario nao encontrado.');
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [appointmentId, userId]);

  const handleConfirm = async () => {
    if (!userId || !appointment) return;
    setSaving(true);
    await confirmAppointment(appointment.id);
    setAppointment({ ...appointment, status: 'confirmado' });
    setSaving(false);
  };

  const handleCancel = async () => {
    if (!userId || !appointment) return;
    setSaving(true);
    await cancelAppointment(appointment.id);
    setAppointment({ ...appointment, status: 'cancelado' });
    setSaving(false);
  };

  return (
    <PageShell
      title={`Horario ${appointmentId}`}
      description="Detalhes do horario agendado."
      breadcrumbs={[{ label: 'Agenda', href: '/schedule' }]}
    >
      {loading && <p className="subtle">Carregando...</p>}
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {appointment && (
        <div className="card">
          <p><strong>Tipo:</strong> {appointment.tipo}</p>
          <p><strong>Status:</strong> {appointment.status}</p>
          <p><strong>Data:</strong> {formatDate(appointment.data)}</p>
          <p><strong>Inicio:</strong> {appointment.horaInicio}</p>
          <p><strong>Fim:</strong> {appointment.horaFim}</p>
          {appointment.observacoes && (
            <p style={{ marginTop: 8 }}><strong>Observacoes:</strong> {appointment.observacoes}</p>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="button" type="button" onClick={handleConfirm} disabled={saving}>
              Confirmar
            </button>
            <button className="button secondary" type="button" onClick={handleCancel} disabled={saving}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
