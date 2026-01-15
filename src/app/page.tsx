import { redirect } from 'next/navigation';

export default function Home() {
  // No homepage selection screen — always start in Super Frames.
  // (This also ensures clicking "Source Console" from anywhere lands on Super Frames.)
  redirect('/table/super-frames');
}