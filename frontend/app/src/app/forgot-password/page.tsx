import { AuthCard, AuthFooterLink, AuthShell } from '@/components/auth/auth-card'

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <AuthCard
        title="Reset access"
        description="We will send a recovery link and verification flow to restore access to your workspace."
        footer={<AuthFooterLink href="/signin" label="Remembered it?" linkText="Return to sign in" />}
      />
    </AuthShell>
  )
}
