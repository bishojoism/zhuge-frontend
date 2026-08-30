// ===== 通用头像：圆形头像（图片在独立裁剪层内）+ 右下角性别徽标（可超出头像范围） =====
import { avatarUrlOf, displayName, initials } from '../lib/utils';

interface AvatarUser {
  avatar_url?: string | null;
  author_avatar?: string | null;
  author?: string;
  username?: string;
  name?: string;
  gender?: string | null;
  author_gender?: string | null;
}

interface AvatarProps {
  user?: AvatarUser | null;
  size?: 'sm' | 'md';
  showGender?: boolean;
  className?: string;
}

export default function Avatar({ user, size = 'md', showGender = false, className = '' }: AvatarProps) {
  const url = avatarUrlOf(user);
  const name = displayName(user);
  // 性别徽标：只显示 男(♂蓝)/女(♀粉)，其它/保密不显示
  const gender = user?.gender || user?.author_gender;
  const isMale = gender === 'male';
  const isFemale = gender === 'female';
  const symbol = isMale ? '♂' : isFemale ? '♀' : '';
  const sizeClass = size === 'sm' ? 'avatar-sm' : size === 'md' ? 'avatar-md' : '';
  return (
    <span className={`avatar-circle ${sizeClass} ${className}`}>
      <span className="avatar-clip">
        {url ? <img src={url} alt="" /> : initials(name)}
      </span>
      {showGender && symbol ? (
        <span className={`gender-badge ${isMale ? 'male' : 'female'}`}>{symbol}</span>
      ) : null}
    </span>
  );
}
