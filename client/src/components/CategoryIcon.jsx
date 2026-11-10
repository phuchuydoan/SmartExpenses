import { House, Utensils, Bus, BookOpen, User, Film, ShoppingBag, Heart, Zap, Shield, Briefcase, Gift, Laptop, Plus, Tag, Plane, Target, PiggyBank, Car, Coffee, Dumbbell, Smartphone } from 'lucide-react';
import { cx } from '../lib/format.js';

export const ICONS = {
  home: House, utensils: Utensils, bus: Bus, book: BookOpen, user: User, film: Film, bag: ShoppingBag, heart: Heart,
  bolt: Zap, shield: Shield, briefcase: Briefcase, gift: Gift, laptop: Laptop, plus: Plus, tag: Tag, plane: Plane,
  target: Target, piggy: PiggyBank, car: Car, coffee: Coffee, gym: Dumbbell, phone: Smartphone,
};

export const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#64748b'];

/** Round tinted icon. The colour identifies the category; the label next to it carries the name. */
export function CategoryIcon({ icon, color = '#64748b', size = 'md', className }) {
  const Icon = ICONS[icon] ?? Tag;
  const box = size === 'sm' ? 'size-8 rounded-lg' : size === 'lg' ? 'size-12 rounded-2xl' : 'size-10 rounded-xl';
  return (
    <span className={cx('grid shrink-0 place-items-center', box, className)} style={{ backgroundColor: `${color}1f`, color }}>
      <Icon className={size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5'} />
    </span>
  );
}
