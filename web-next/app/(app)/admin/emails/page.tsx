'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import PageShell from '@/components/PageShell';
import AdminGate from '@/components/AdminGate';
import { getFirebaseApp } from '@/lib/services/firebase';

const REGION = 'southamerica-east1';
const DEFAULT_PRIMARY_EMAIL = 'suporte@mhpersonaltrainer.com.br';
const DEFAULT_SECONDARY_EMAIL = 'contato@mhpersonaltrainer.com.br';

const EMAIL_ACCOUNTS = [
  {
    id: 'primary',
    label: 'Suporte',
    address: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || DEFAULT_PRIMARY_EMAIL,
  },
  {
    id: 'secondary',
    label: 'Contato',
    address: process.env.NEXT_PUBLIC_SUPPORT_EMAIL_SECONDARY || DEFAULT_SECONDARY_EMAIL,
  },
];

type EmailAddress = {
  name?: string;
  address: string;
};

type EmailSummary = {
  uid: number;
  subject?: string;
  from?: EmailAddress;
  date?: string;
  seen?: boolean;
  snippet?: string;
};

type EmailMessage = EmailSummary & {
  to?: EmailAddress[];
  cc?: EmailAddress[];
  html?: string;
  text?: string;
  messageId?: string;
  references?: string[];
};

const formatAddress = (address?: EmailAddress) => {
  if (!address?.address) return '-';
  if (address.name) return `${address.name} <${address.address}>`;
  return address.address;
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

const buildReplySubject = (subject?: string) => {
  if (!subject) return 'Re:';
  return subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
};

export default function AdminEmailsPage() {
  const functions = useMemo(() => getFunctions(getFirebaseApp(), REGION), []);
  const listInbox = useMemo(() => httpsCallable(functions, 'adminEmailInbox'), [functions]);
  const getMessage = useMemo(() => httpsCallable(functions, 'adminEmailMessage'), [functions]);
  const sendMessage = useMemo(() => httpsCallable(functions, 'adminEmailSend'), [functions]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState<'primary' | 'secondary'>('primary');
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isThemeDark, setIsThemeDark] = useState(false);

  const activeAccount = useMemo(
    () => EMAIL_ACCOUNTS.find((item) => item.id === accountId) || EMAIL_ACCOUNTS[0],
    [accountId]
  );

  const totalCount = emails.length;
  const unreadCount = emails.filter((item) => !item.seen).length;

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const result = await listInbox({ limit: 40, account: accountId });
      const payload = result.data as { items?: EmailSummary[] };
      const items = payload?.items || [];
      setEmails(items);
      setSelectedId((prev) => (prev || !items.length ? prev : items[0].uid));
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel carregar a caixa de entrada.');
    } finally {
      setLoading(false);
    }
  }, [listInbox, accountId]);

  const fetchMessage = useCallback(
    async (uid: number) => {
      setMessageLoading(true);
      setError('');
      try {
        const result = await getMessage({ uid, account: accountId });
        const payload = result.data as { message?: EmailMessage };
        const message = payload?.message || null;
        setSelectedMessage(message);
        if (message?.from?.address) {
          setReplyTo(message.from.address);
          setReplySubject(buildReplySubject(message.subject));
        }
      } catch (err: any) {
        setError(err?.message || 'Nao foi possivel abrir o email.');
      } finally {
        setMessageLoading(false);
      }
    },
    [getMessage, accountId]
  );

  const handleSelect = (uid: number) => {
    setSelectedId(uid);
  };

  const handleSend = async () => {
    if (!replyTo) {
      setInfo('Informe o destinatario.');
      return;
    }
    if (!replyBody.trim()) {
      setInfo('Escreva a mensagem.');
      return;
    }
    setSending(true);
    setInfo('');
    setError('');
    try {
      const payload = {
        to: replyTo,
        subject: replySubject || 'Re:',
        text: replyBody.trim(),
        inReplyTo: selectedMessage?.messageId,
        references: selectedMessage?.references || [],
        account: accountId,
      };
      const result = await sendMessage(payload);
      const response = result.data as { success?: boolean };
      if (response?.success) {
        setInfo('Resposta enviada.');
        setReplyBody('');
      } else {
        setInfo('Mensagem enviada.');
        setReplyBody('');
      }
    } catch (err: any) {
      setError(err?.message || 'Nao foi possivel enviar agora.');
    } finally {
      setSending(false);
    }
  };

  const filteredEmails = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return emails;
    return emails.filter((item) => {
      const subject = (item.subject || '').toLowerCase();
      const from = `${item.from?.name || ''} ${item.from?.address || ''}`.toLowerCase();
      return subject.includes(term) || from.includes(term);
    });
  }, [emails, search]);

  useEffect(() => {
    if (selectedId) {
      fetchMessage(selectedId);
    }
  }, [selectedId, fetchMessage]);

  useEffect(() => {
    setSelectedId(null);
    setSelectedMessage(null);
    setEmails([]);
    setReplyTo('');
    setReplySubject('');
    setReplyBody('');
    fetchInbox();
  }, [accountId, fetchInbox]);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      const datasetTheme = root.dataset.theme;
      if (datasetTheme === 'dark' || datasetTheme === 'light') {
        setIsThemeDark(datasetTheme === 'dark');
        return;
      }

      const storedTheme = localStorage.getItem('mh-theme');
      if (storedTheme === 'dark' || storedTheme === 'light') {
        setIsThemeDark(storedTheme === 'dark');
        return;
      }

      setIsThemeDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => syncTheme();
    media.addEventListener('change', onMediaChange);

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'mh-theme') {
        syncTheme();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return (
    <PageShell
      title="Central de emails"
      description="Leia e responda mensagens do dominio."
      breadcrumbs={[{ label: 'Admin', href: '/admin' }]}
    >
      <AdminGate>
        <div className={`admin-email-hub${isThemeDark ? ' is-theme-dark' : ''}`}>
          <div className="admin-email-hero">
            <div className="admin-email-hero-copy">
              <span className="admin-email-kicker">Central</span>
              <h2>Emails do dominio</h2>
              <p className="subtle">
                Leia, responda e organize o atendimento direto do painel.
              </p>
              <div className="admin-email-account-row">
                {EMAIL_ACCOUNTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-email-account ${accountId === item.id ? 'is-active' : ''}`}
                    onClick={() => setAccountId(item.id as 'primary' | 'secondary')}
                  >
                    <span>{item.label}</span>
                    <strong>{item.address}</strong>
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-email-hero-stats">
              <div className="admin-email-stat">
                <span>Total</span>
                <strong>{totalCount}</strong>
              </div>
              <div className="admin-email-stat">
                <span>Nao lidos</span>
                <strong>{unreadCount}</strong>
              </div>
              <div className="admin-email-stat is-primary">
                <span>Conta ativa</span>
                <strong>{activeAccount.address}</strong>
                <small>{activeAccount.label}</small>
              </div>
            </div>
          </div>

          <div className="admin-email-toolbar">
            <div>
              <h3>Caixa de entrada</h3>
              <p className="subtle">
                Sincronizada com {activeAccount.address}.
              </p>
            </div>
            <div className="admin-email-toolbar-actions">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por assunto ou remetente"
              />
              <button type="button" className="button secondary" onClick={fetchInbox}>
                Atualizar
              </button>
            </div>
          </div>

          {(error || info) && (
            <div className="admin-email-alert">
              <span>{error || info}</span>
            </div>
          )}

          <div className="admin-email-layout">
            <div className="admin-email-list card">
              <div className="admin-email-list-head">
                <strong>Mensagens</strong>
                <span>{loading ? '...' : `${filteredEmails.length} itens`}</span>
              </div>
              {loading ? (
                <div className="admin-email-empty">Carregando emails...</div>
              ) : filteredEmails.length ? (
                filteredEmails.map((item) => (
                  <button
                    key={item.uid}
                    type="button"
                    className={`admin-email-item ${selectedId === item.uid ? 'is-active' : ''} ${
                      item.seen ? '' : 'is-unread'
                    }`}
                    onClick={() => handleSelect(item.uid)}
                  >
                    <div className="admin-email-item-head">
                      <strong>{item.from?.name || item.from?.address || 'Remetente'}</strong>
                      <span>{formatDateTime(item.date)}</span>
                    </div>
                    <p className="admin-email-item-subject">{item.subject || 'Sem assunto'}</p>
                    <p className="admin-email-item-snippet">
                      {item.snippet || 'Clique para ver o conteudo.'}
                    </p>
                  </button>
                ))
              ) : (
                <div className="admin-email-empty">Nenhum email encontrado.</div>
              )}
            </div>

            <div className="admin-email-message card">
              {messageLoading ? (
                <div className="admin-email-empty">Carregando mensagem...</div>
              ) : selectedMessage ? (
                <>
                  <div className="admin-email-message-head">
                    <div>
                      <h3>{selectedMessage.subject || 'Sem assunto'}</h3>
                      <p className="subtle">
                        De: {formatAddress(selectedMessage.from)} - {formatDateTime(selectedMessage.date)}
                      </p>
                      {selectedMessage.to?.length ? (
                        <p className="subtle">
                          Para: {selectedMessage.to.map((item) => formatAddress(item)).join(', ')}
                        </p>
                      ) : null}
                      {selectedMessage.cc?.length ? (
                        <p className="subtle">
                          CC: {selectedMessage.cc.map((item) => formatAddress(item)).join(', ')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="admin-email-message-body">
                    {selectedMessage.html ? (
                      <iframe
                        title="Email"
                        className="admin-email-frame"
                        sandbox=""
                        srcDoc={selectedMessage.html}
                      />
                    ) : (
                      <pre>{selectedMessage.text || 'Sem conteudo.'}</pre>
                    )}
                  </div>

                  <div className="admin-email-reply">
                    <h4>Responder</h4>
                    <p className="subtle">
                      Enviando como {activeAccount.address}.
                    </p>
                    <div className="admin-email-reply-fields">
                      <label>
                        <span>Para</span>
                        <input
                          value={replyTo}
                          onChange={(event) => setReplyTo(event.target.value)}
                          placeholder="destino@email.com"
                        />
                      </label>
                      <label>
                        <span>Assunto</span>
                        <input
                          value={replySubject}
                          onChange={(event) => setReplySubject(event.target.value)}
                          placeholder="Assunto"
                        />
                      </label>
                    </div>
                    <label className="admin-email-reply-textarea">
                      <span>Mensagem</span>
                      <textarea
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        placeholder="Escreva sua resposta..."
                      />
                    </label>
                    <div className="admin-email-reply-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={handleSend}
                        disabled={sending}
                      >
                        {sending ? 'Enviando...' : 'Enviar resposta'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="admin-email-empty">Selecione um email para ler.</div>
              )}
            </div>
          </div>
        </div>
      </AdminGate>
    </PageShell>
  );
}
