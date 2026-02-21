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
    <section className="page-shell">
      <header className="page-header">
        <div className="page-header-main">
          {breadcrumbs?.length ? (
            <nav className="page-breadcrumbs" aria-label="Navegacao da pagina">
              {breadcrumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="subtle page-breadcrumb-item">
                  {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}
                  {index < breadcrumbs.length - 1 ? <span className="page-breadcrumb-separator">/</span> : null}
                </span>
              ))}
            </nav>
          ) : null}
          <div className="page-title-row">
            <h1>{title}</h1>
            {titleAddon ? <div className="page-title-addon">{titleAddon}</div> : null}
          </div>
          {description && <p className="subtle">{description}</p>}
        </div>
        {actions?.length ? (
          <div className="page-header-actions">
            {actions.map((action) => (
              <Link key={action.href} href={action.href} className="button secondary">
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
