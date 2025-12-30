import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Wallet | CodeArena',
  description: 'Manage your CodeArena credits, purchase more, and view your transaction history.',
};

export default function WalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
