import Link from 'next/link';

interface PageShellProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: { label: string; href: string }[];
  titleAddon?: React.ReactNode;
  children?: React.ReactNode;
}

export default function PageShell({
  title,
  description,
  breadcrumbs,
  actions,
  titleAddon,
  children,
}: PageShellProps) {
  return (
    <section>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {breadcrumbs?.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="subtle">
                {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
                {index < (breadcrumbs.length - 1) ? ' / ' : ''}
              </span>
            ))}
          </div>
          <div className="page-title-row">
            <h1>{title}</h1>
            {titleAddon ? <div className="page-title-addon">{titleAddon}</div> : null}
          </div>
          {description && <p className="subtle">{description}</p>}
        </div>
        {actions?.length ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {actions.map((action) => (
              <Link key={action.href} href={action.href} className="button secondary">
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
