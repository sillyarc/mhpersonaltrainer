import PageShell from '@/components/PageShell';

const faqs = [
  { q: 'Como criar um treino?', a: 'Acesse Treinos > Criar treino e preencha os blocos.' },
  { q: 'Como adicionar aluno?', a: 'Vá em Alunos e clique em Adicionar aluno.' },
  { q: 'Como usar a IA?', a: 'No menu MH Assistente, escolha Assistente ou Analise de imagem.' },
];

export default function HelpPage() {
  return (
    <PageShell
      title="Central de ajuda"
      description="Tutoriais, respostas rapidas e guias do app."
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {faqs.map((faq) => (
          <div key={faq.q} className="card">
            <h3>{faq.q}</h3>
            <p className="subtle" style={{ marginTop: 8 }}>{faq.a}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}


