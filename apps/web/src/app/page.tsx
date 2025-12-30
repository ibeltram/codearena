import Link from 'next/link';
import { Swords, Trophy, Wallet, Zap, Target, Users } from 'lucide-react';

import { MainLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const features = [
  {
    icon: Swords,
    title: 'Timed Challenges',
    description:
      'Accept challenges with time limits ranging from 15 minutes to 4 hours. Work in your own IDE.',
  },
  {
    icon: Target,
    title: 'Fair Judging',
    description:
      'Deterministic automated testing with transparent rubrics. Every score is explainable.',
  },
  {
    icon: Wallet,
    title: 'Credits & Stakes',
    description:
      'Stake credits on matches, earn through wins, and redeem for platform automation services.',
  },
  {
    icon: Trophy,
    title: 'Tournaments',
    description:
      'Compete in sponsored tournaments with real prize pools. Climb the leaderboard.',
  },
  {
    icon: Zap,
    title: 'VS Code Extension',
    description:
      'Non-invasive extension for matchmaking and submission. Never disrupts your workflow.',
  },
  {
    icon: Users,
    title: 'Community',
    description:
      'Join ranked matches, invite friends for direct battles, or spectate top players.',
  },
];

export default function Home() {
  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="py-12 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-4">
            Beta Launch
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Prove Your Code.
            <br />
            <span className="text-primary">Win The Arena.</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Accept timed challenges, compete head-to-head, and be judged by
            transparent automation. Work in your own IDE, stake credits, and
            climb the ranks.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link href="/challenges">
              <Button size="lg" className="gap-2">
                <Swords className="h-5 w-5" />
                Browse Challenges
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Built for Competitive Builders
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to compete, improve, and prove your skills.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <feature.icon className="h-10 w-10 text-primary" />
                <CardTitle className="mt-4">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
            <Trophy className="h-12 w-12" />
            <div>
              <h2 className="text-2xl font-bold">Ready to Compete?</h2>
              <p className="mt-2 text-primary-foreground/80">
                Create an account and enter your first match in minutes.
              </p>
            </div>
            <Link href="/register">
              <Button size="lg" variant="secondary">
                Get Started Free
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </MainLayout>
  );
}
