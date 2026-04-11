import { redirect } from 'next/navigation'

// Login is now handled by Hexa Suite at hexamatics.finance
export default function LoginPage() {
  redirect('https://hexamatics.finance/login')
}
