import { Suspense } from 'react';
import LoginAlunoPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginAlunoPage />
    </Suspense>
  );
}
