import './brand.css';

type Props = { variant?: 'symbol' | 'emblem' | 'wordmark'; className?: string; alt?: string };

// Owner-supplied originals: no filters, recolouring, cropping or substitute art.
export function Brand({ variant = 'wordmark', className = '', alt = 'EGIN' }: Props) {
  return <img className={`brand-image brand-image-${variant} ${className}`} src={`/brand/${variant}.png`}
    width={variant === 'wordmark' ? 2172 : 1536} height={variant === 'wordmark' ? 724 : 1024}
    alt={alt} decoding="async" draggable={false} />;
}
