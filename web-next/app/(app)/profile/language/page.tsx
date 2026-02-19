import PageShell from '@/components/PageShell';

export default function ProfileLanguagePage() {
  return (
    <PageShell
      title="Idioma"
      description="Selecione o idioma do app."
      breadcrumbs={[{ label: 'Perfil', href: '/profile' }]}
    >
      <div className="card">
        <form style={{ display: 'grid', gap: 10 }}>
          <label>
            <input type="radio" name="lang" defaultChecked /> Portugues (BR)
          </label>
          <label>
            <input type="radio" name="lang" /> English
          </label>
          <button className="button" type="submit">Salvar idioma</button>
        </form>
      </div>
    </PageShell>
  );
}
