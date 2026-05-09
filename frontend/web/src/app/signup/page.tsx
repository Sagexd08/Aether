import { AuthCard, AuthFooterLink, AuthShell } from '@/components/auth/auth-card'

export default function SignUpPage() {
  return (
    <AuthShell>
      <AuthCard
        title="Create your studio"
        description="Open an AETHER workspace for text, image, video, audio, workflows, and AI-native production."
        footer={<AuthFooterLink href="/signin" label="Already inside?" linkText="Sign in" />}
      />
    </AuthShell>
  )
}
