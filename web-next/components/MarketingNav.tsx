import Link from 'next/link';
import MobileAwareLink from '@/components/MobileAwareLink';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './MarketingNav.module.css';

const navItems = [
  { href: '/', label: 'Inicio' },
  { href: '/#demo', label: 'Demo' },
  { href: '/#workstation', label: 'Operacao' },
  { href: '/#assistente', label: 'Assistente IA' },
  { href: '/#planos', label: 'Planos' },
  { href: '/academia', label: 'Academia' },
];

export default function MarketingNav() {
  return (
    <header className={styles.navShell}>
      <div className={`container ${styles.navInner}`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>MH</span>
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>Personal</span>
            <span className={styles.brandSub}>Trainer</span>
          </span>
        </Link>

        <nav className={styles.navLinks}>
          <div className={styles.navMenu}>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ))}
          </div>

          <div className={styles.navActions}>
            <ThemeToggle compact iconOnly className={`${styles.themeToggle} marketing-nav-theme-toggle`} />
            <MobileAwareLink href="/login" mobilePath="/login" className={styles.loginBtn}>
              Entrar
            </MobileAwareLink>
            <MobileAwareLink href="/register" mobilePath="/register" className={styles.ctaBtn}>
              Criar conta
            </MobileAwareLink>
          </div>
        </nav>
      </div>

      <div className={styles.navMetaBar}>
        <div className="container">
          <div className={styles.metaTrack}>
            <span>Aluno: Android + Web mobile</span>
            <span>Personal: Windows + Web + Android</span>
            <span>Academia: Windows + Web instalavel</span>
            <span>Assistente inteligente em treino, avaliacao e conversa</span>
            <span>iOS em breve</span>
          </div>
        </div>
      </div>
    </header>
  );
}
