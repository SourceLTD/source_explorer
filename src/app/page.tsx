import { redirect } from 'next/navigation';

export default function Home() {
  // No homepage selection screen — always start in Frame Graph mode.
  // (This also ensures clicking "Source Console" from anywhere lands on the frame graph.)
  redirect('/graph/frames');
}