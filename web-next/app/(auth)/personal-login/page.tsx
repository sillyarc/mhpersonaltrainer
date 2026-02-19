import { Suspense } from 'react';
import PersonalLoginPage from './ClientPage';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PersonalLoginPage />
    </Suspense>
  );
}
