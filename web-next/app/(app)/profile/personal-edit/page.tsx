import { redirect } from 'next/navigation';

export default function ProfilePersonalEditPage() {
  redirect('/profile?sheet=professional');
}
