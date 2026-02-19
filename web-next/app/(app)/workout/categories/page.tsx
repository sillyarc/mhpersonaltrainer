import PageShell from '@/components/PageShell';

const categories = [
  'Hipertrofia',
  'Emagrecimento',
  'Resistencia',
  'Cardio',
  'Mobilidade',
  'Treino funcional',
];

export default function WorkoutCategoriesPage() {
  return (
    <PageShell
      title="Categorias de treino"
      description="Explore categorias e modelos para seus alunos."
      breadcrumbs={[{ label: 'Treinos', href: '/workouts' }]}
    >
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {categories.map((item) => (
          <div key={item} className="card">
            <h3>{item}</h3>
            <p className="subtle" style={{ marginTop: 8 }}>
              Modelos prontos com IA e ajustes finos.
            </p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
