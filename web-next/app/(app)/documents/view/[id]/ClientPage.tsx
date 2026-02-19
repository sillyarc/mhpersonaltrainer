'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import PageShell from '@/components/PageShell';
import UserScopePicker from '@/components/data/UserScopePicker';
import { formatDate, useDocumentData, useUserScope } from '@/lib/firestoreHooks';

interface DocumentRow {
  id: string;
  titulo?: string;
  nome?: string;
  createdAt?: any;
  data?: any;
  url?: string;
  arquivos?: string;
  fotos?: string;
}

export default function DocumentViewPage({ params }: { params: { id: string } }) {
  const { userId } = useUserScope();
  const pathname = usePathname();
  const documentId = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last !== 'view' ? last : params.id;
  }, [pathname, params.id]);
  const { data } = useDocumentData<DocumentRow>(['users', userId, 'arquivos', documentId]);

  return (
    <PageShell
      title={`Visualizar documento ${documentId}`}
      description="Preview do documento enviado."
      breadcrumbs={[{ label: 'Documentos', href: '/documents' }]}
    >
      <UserScopePicker />
      <div className="card">
        {userId && data ? (
          <>
            <h3>{data.titulo ?? data.nome ?? 'Documento'}</h3>
            <p className="subtle" style={{ marginTop: 8 }}>
              Criado em {formatDate(data.createdAt ?? data.data)}
            </p>
            {data.url || data.arquivos || data.fotos ? (
              <a
                href={data.url || data.arquivos || data.fotos}
                className="button secondary"
                style={{ marginTop: 16 }}
                target="_blank"
                rel="noreferrer"
              >
                Abrir documento
              </a>
            ) : (
              <p className="subtle" style={{ marginTop: 12 }}>
                URL do documento nao encontrada.
              </p>
            )}
          </>
        ) : (
          <p className="subtle">Informe um UID para visualizar documentos.</p>
        )}
      </div>
    </PageShell>
  );
}
