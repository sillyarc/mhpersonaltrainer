import { Suspense } from 'react';
import AcademyLoginPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AcademyLoginPage />
    </Suspense>
  );
}
