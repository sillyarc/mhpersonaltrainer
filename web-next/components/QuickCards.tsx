interface CardItem {
  title: string;
  text: string;
  meta?: string;
}

export default function QuickCards({ items }: { items: CardItem[] }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {items.map((item) => (
        <div key={item.title} className="card">
          <h3>{item.title}</h3>
          <p className="subtle" style={{ marginTop: 8 }}>
            {item.text}
          </p>
          {item.meta && (
            <p className="pill" style={{ marginTop: 12, width: 'fit-content' }}>
              {item.meta}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
