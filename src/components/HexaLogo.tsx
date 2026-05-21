import Image from 'next/image'

interface Props {
  className?: string
}

export function HexaLogo({ className = 'h-8' }: Props) {
  return (
    <Image
      src="/logo.png"
      alt="HEXA"
      width={160}
      height={44}
      className={className}
      style={{ width: 'auto', objectFit: 'contain' }}
      priority
    />
  )
}
