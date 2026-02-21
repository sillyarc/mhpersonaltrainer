import { Suspense } from 'react';
import RegisterAcademyPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegisterAcademyPage />
    </Suspense>
  );
}
