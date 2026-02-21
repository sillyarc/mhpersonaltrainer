'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import PageShell from '@/components/PageShell';
import AcademyGate from '@/components/AcademyGate';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/firestoreHooks';
import { useAcademyData } from '@/lib/hooks/useAcademyData';
import { getFirebaseDb } from '@/lib/services/firebase';

type CheckinEntry = {
  id: string;
  studentId?: string;
  studentName?: string;
  method?: string;
  createdAt?: Date;
  validation?: string;
  validated?: boolean;
  readerToken?: string | null;
  photoConfidence?: number | null;
  photoReason?: string | null;
  capturedPhotoUrl?: string | null;
  manualOverride?: boolean;
  notes?: string | null;
};

const methodLabels: Record<string, string> = {
  biometria: 'Biometria',
  foto: 'Foto',
  nfc: 'NFC',
};

const validationLabels: Record<string, string> = {
  match: 'Validado',
  enrolled: 'Novo cadastro',
  'photo-ai-match': 'Foto validada por IA',
  'photo-confirmed': 'Foto confirmada',
  'photo-ai-mismatch': 'Foto divergente',
  'photo-ai-error': 'Falha de validacao',
  'photo-manual': 'Confirmacao manual',
  manual: 'Manual',
};

const toDate = (value?: any) => {
  if (!value) return undefined;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const formatToken = (value?: string | null) => {
  if (!value) return '';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export default function AcademyCheckinsPage() {
  const { user } = useAuth();
  const { academyCodeRaw } = useAcademyData();
  const [entries, setEntries] = useState<CheckinEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [validationFilter, setValidationFilter] = useState('all');

  useEffect(() => {
    const academyId = user?.uid || '';
    if (!academyId && !academyCodeRaw) {
      setError('Conta da academia nao encontrada.');
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);

    const db = getFirebaseDb();
    const entriesRef = collection(db, 'academyCheckins');
    const filter = academyId
      ? where('academyId', '==', academyId)
      : where('academyCode', '==', academyCodeRaw);
    const entriesQuery = query(
      entriesRef,
      filter,
      orderBy('createdAt', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      entriesQuery,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            studentId: data.studentId,
            studentName: data.studentName,
            method: data.method || 'manual',
            createdAt: toDate(data.createdAt),
            validation: data.validation || 'manual',
            validated: data.validated,
            readerToken: data.readerToken || null,
            photoConfidence:
              typeof data.photoConfidence === 'number' ? data.photoConfidence : null,
            photoReason: data.photoReason || null,
            capturedPhotoUrl: data.capturedPhotoUrl || null,
            manualOverride: data.manualOverride === true,
            notes: data.notes || null,
          } as CheckinEntry;
        });
        setEntries(items);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || 'Erro ao carregar historico.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [academyCodeRaw, user?.uid]);

  const filteredEntries = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (methodFilter !== 'all' && entry.method !== methodFilter) return false;
      if (validationFilter !== 'all' && entry.validation !== validationFilter) return false;
      if (!term) return true;
      const name = (entry.studentName || '').toLowerCase();
      const studentId = (entry.studentId || '').toLowerCase();
      return name.includes(term) || studentId.includes(term);
    });
  }, [entries, methodFilter, searchQuery, validationFilter]);

  const totals = useMemo(() => {
    const counts = { total: entries.length, biometria: 0, foto: 0, nfc: 0 };
    entries.forEach((entry) => {
      if (entry.method === 'biometria') counts.biometria += 1;
      if (entry.method === 'foto') counts.foto += 1;
      if (entry.method === 'nfc') counts.nfc += 1;
    });
    return counts;
  }, [entries]);

  return (
    <PageShell
      title="Historico de entradas"
      description="Entradas registradas pela academia, com metodo e validacao."
    >
      <AcademyGate>
        {error && (
          <div className="academy-alert is-danger" style={{ marginBottom: 20 }}>
            <div>
              <strong>Erro ao carregar</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="academy-dashboard academy-revamp academy-checkins">
          <section className="academy-checkins-hero">
            <div>
              <p className="academy-block-kicker">Controle de entrada</p>
              <h2>Historico de entradas em tempo real.</h2>
              <p className="subtle">
                Acompanhe quem entrou, por qual metodo e a validacao aplicada no acesso.
              </p>
            </div>
            <div className="academy-checkins-stats">
              <div>
                <span>Total</span>
                <strong>{totals.total}</strong>
              </div>
              <div>
                <span>Biometria</span>
                <strong>{totals.biometria}</strong>
              </div>
              <div>
                <span>Foto</span>
                <strong>{totals.foto}</strong>
              </div>
              <div>
                <span>NFC</span>
                <strong>{totals.nfc}</strong>
              </div>
            </div>
          </section>

          <section className="academy-block academy-checkins-list">
            <div className="academy-checkins-header">
              <div>
                <h3>Registros recentes</h3>
                <p className="subtle">Lista completa de entradas registradas.</p>
              </div>
              <div className="academy-checkins-filters">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar por aluno ou UID"
                />
                <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                  <option value="all">Todos os metodos</option>
                  <option value="biometria">Biometria</option>
                  <option value="foto">Foto</option>
                  <option value="nfc">NFC</option>
                </select>
                <select
                  value={validationFilter}
                  onChange={(event) => setValidationFilter(event.target.value)}
                >
                  <option value="all">Todas as validacoes</option>
                  <option value="match">Validado</option>
                  <option value="enrolled">Novo cadastro</option>
                  <option value="photo-ai-match">Foto validada por IA</option>
                  <option value="photo-ai-mismatch">Foto divergente</option>
                  <option value="photo-ai-error">Falha de validacao</option>
                  <option value="photo-confirmed">Foto confirmada</option>
                  <option value="photo-manual">Confirmacao manual</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className="subtle">Carregando entradas...</p>
            ) : filteredEntries.length ? (
              <div className="academy-checkins-grid">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="academy-checkins-card">
                    <div className="academy-checkins-card-head">
                      <div>
                        <strong>{entry.studentName || 'Aluno'}</strong>
                        <span>{entry.studentId || '--'}</span>
                      </div>
                      <span className="academy-checkins-tag">
                        {methodLabels[entry.method || ''] || 'Manual'}
                      </span>
                    </div>
                    <div className="academy-checkins-meta">
                      <span>
                        Entrada: {entry.createdAt ? formatDate(entry.createdAt) : 'Sem data'}
                      </span>
                      <span className="academy-checkins-pill">
                        {validationLabels[entry.validation || ''] || 'Manual'}
                      </span>
                      {entry.method === 'foto' && typeof entry.photoConfidence === 'number' ? (
                        <span className="academy-checkins-pill">
                          Confianca {Math.round(entry.photoConfidence * 100)}%
                        </span>
                      ) : null}
                      {entry.readerToken ? (
                        <span className="academy-checkins-token">
                          Leitura {formatToken(entry.readerToken)}
                        </span>
                      ) : null}
                      {entry.method === 'foto' && entry.manualOverride ? (
                        <span className="academy-checkins-token">Override manual</span>
                      ) : null}
                    </div>
                    {entry.photoReason ? <p className="academy-checkins-notes">{entry.photoReason}</p> : null}
                    {entry.notes ? <p className="academy-checkins-notes">{entry.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="subtle">Nenhuma entrada registrada ainda.</p>
            )}
          </section>
        </div>
      </AcademyGate>
    </PageShell>
  );
}
