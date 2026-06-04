import { appUrl } from '../utils/appBase';
import './AppIcon.css';

interface AppIconProps {
  size?: number;
  className?: string;
}

/** 与 /favicon.svg 一致的菱形品牌图标 */
export function AppIcon({ size = 24, className = '' }: AppIconProps) {
  return (
    <img
      className={`app-icon ${className}`.trim()}
      src={appUrl('/favicon.svg')}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  );
}
