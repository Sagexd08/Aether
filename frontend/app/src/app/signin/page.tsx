import { AuthCard, AuthFooterLink, AuthShell } from '@/components/auth/auth-card'

export default function SignInPage() {
  return (
    <AuthShell>
      <AuthCard
        title="Welcome back"
        description="Sign in to re-enter your cinematic workspace and continue your generation timeline."
        footer={<AuthFooterLink href="/signup" label="Need an account?" linkText="Create one" />}
      />
    </AuthShell>
  )
}
