import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function CheckEmailPage() {
  // This page is deprecated - redirect to login to start the new OTP flow
  redirect('/login');
  
  return null;
}
