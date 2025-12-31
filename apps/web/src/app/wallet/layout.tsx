import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wallet | RepoRivals',
  description: 'Manage your RepoRivals credits, purchase more, and view your transaction history.',
};

export default function WalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
