import Link from 'next/link';
import MobileAwareLink from '@/components/MobileAwareLink';
import styles from './MarketingFooter.module.css';

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.mycompany.mfitfitnessapp';
const WINDOWS_APP = '/downloads/mh-personal-trainer-setup-8.9.42-111.exe';

export default function MarketingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.top}`}>
        <div className={styles.brandCol}>
          <p className={styles.brandTitle}>MH Personal Trainer</p>
          <p className={styles.brandText}>
            Plataforma para aluno, personal e academia com operacao conectada, assistente inteligente e painel
            multiplataforma.
          </p>

          <div className={styles.storeRow}>
            <a href={PLAY_STORE} target="_blank" rel="noreferrer">
              Google Play
            </a>
            <a href={WINDOWS_APP} download>
              Windows App
            </a>
            <span>iOS em breve</span>
          </div>

          <div className={styles.actions}>
            <MobileAwareLink href="/register" mobilePath="/register" className={styles.ctaBtn}>
              Criar conta
            </MobileAwareLink>
            <Link href="/help" className={styles.ghostBtn}>
              Central de ajuda
            </Link>
          </div>
        </div>

        <div className={styles.linksGrid}>
          <div className={styles.col}>
            <p className={styles.colTitle}>Produto</p>
            <div className={styles.links}>
              <Link href="/#workstation">Workstation</Link>
              <Link href="/#beneficios">Integracao</Link>
              <Link href="/login">Painel web</Link>
            </div>
          </div>

          <div className={styles.col}>
            <p className={styles.colTitle}>Assistente</p>
            <div className={styles.links}>
              <Link href="/#assistente">Recursos de IA</Link>
              <Link href="/#planos">Planos do personal</Link>
              <Link href="/register-personal">Comecar como personal</Link>
            </div>
          </div>

          <div className={styles.col}>
            <p className={styles.colTitle}>Empresa</p>
            <div className={styles.links}>
              <Link href="/equipe">Equipe</Link>
              <Link href="/academia">Academia</Link>
              <Link href="/terms">Termos</Link>
            </div>
          </div>

          <div className={styles.col}>
            <p className={styles.colTitle}>Suporte</p>
            <div className={styles.links}>
              <Link href="/help">Central de ajuda</Link>
              <Link href="/support/ticket">Abrir ticket</Link>
              <Link href="/privacy">Privacidade</Link>
            </div>
          </div>
        </div>
      </div>

      <div className={`container ${styles.bottom}`}>
        <p className={styles.bottomText}>Desenvolvido por Nagazaki Software. 2026 MH Personal Trainer.</p>
        <div className={styles.inlineLinks}>
          <Link href="/privacy">Privacidade</Link>
          <Link href="/terms">Termos</Link>
          <Link href="/account-deletion">Exclusao de conta</Link>
        </div>
      </div>
    </footer>
  );
}
