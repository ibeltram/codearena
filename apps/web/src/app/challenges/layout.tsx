import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Challenges - CodeArena',
  description: 'Browse and compete in coding challenges',
};

export default function ChallengesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
