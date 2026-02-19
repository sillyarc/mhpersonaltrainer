import { Suspense } from 'react';
import RegisterAlunoPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterAlunoPage />
    </Suspense>
  );
}
