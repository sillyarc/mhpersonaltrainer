'use client';

import { useEffect } from 'react';
import ProfileInfoEditor from './ProfileInfoEditor';
import styles from './ProfileEditBottomSheet.module.css';

type ProfileEditBottomSheetProps = {
  open: boolean;
  onClose: () => void;
};

export default function ProfileEditBottomSheet({ open, onClose }: ProfileEditBottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const originalOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.sheet} role="presentation">
      <button type="button" className={styles.overlay} onClick={onClose} aria-label="Fechar editor de perfil" />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.handle} />
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Perfil</p>
            <h3 id="profile-edit-sheet-title">Editar perfil do personal</h3>
            <p className="subtle">Atualize dados profissionais e informacoes da sua conta.</p>
          </div>
          <button type="button" className="button secondary sm" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className={styles.body}>
          <ProfileInfoEditor includeProfessionalFields initialTab="professional" variant="plain" />
        </div>
      </div>
    </div>
  );
}
