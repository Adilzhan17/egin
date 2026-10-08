import { Icon, type IconName } from './Icon';
export function ComingSoon({ title, heading, text, icon, children }: { title: string; heading: string; text: string; icon: IconName; children?: React.ReactNode }) {
  return <div className="coming-page"><header className="coming-header"><h1>{title}</h1><span>egin.</span></header><section className="coming-content"><div className="coming-illustration"><Icon name={icon} size={62} /></div><span className="pill"><span className="pill-dot" />В разработке</span><h2>{heading}</h2><p>{text}</p><a className="secondary-button" href="#/">Вернуться к полю<Icon name="right" size={17} /></a></section>{children}</div>;
}
