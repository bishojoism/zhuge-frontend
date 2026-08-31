// ===== 全局类型（与后端 API 契约对应） =====

export type Gender = 'male' | 'female' | 'other' | 'secret';

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  avatar_url: string | null;
  gender: Gender;
}

export interface Tag {
  id: number;
  name: string;
  slug: string | null;
  description: string | null;
  color: string;
  position: number | null; // 主标签 = 数字（排序），次标签 = null
  is_restricted: number;
  is_hidden: number;
  discussion_count: number;
  icon: string | null;
  is_primary?: number;
}

export interface Discussion {
  id: number;
  title: string;
  comment_count: number;
  created_at: string;
  user_id: number;
  first_post_id: number | null;
  last_posted_at: string | null;
  last_posted_user_id: number | null;
  slug: string | null;
  is_private: number;
  is_sticky: number;
  is_locked: number;
  didi_count: number;
  hot_score: number;
  // 滴滴响应状态（私密主题）：'accepted' | 'declined' | null
  didi_status?: 'accepted' | 'declined' | null;
  // 首帖所用角色 id（列表卡片点击作者名时定位角色）
  first_character_id?: number | null;
  // 联表字段（列表接口返回）
  author?: string;
  author_avatar?: string | null;
  author_gender?: Gender;
  excerpt?: string;
  image_url?: string | null;
  tags?: string; // "A / B"
  /** 作者已获徽章（"icon:tier" 逗号分隔，tier=1 为进阶徽章带特效），作者名旁展示 */
  author_badges?: string | null;
  // 一键三连：点赞/收藏/投币计数 + 当前用户状态（后端联表返回）
  like_count?: number;
  favorite_count?: number;
  coin_count?: number;
  liked?: number | null;
  favorited?: number | null;
  /** 作者累计获得的格币（等级徽章依据） */
  author_earned?: number | null;
  /** 首帖被滴滴次数（列表接口返回，乐观帧显示） */
  post_didi_count?: number;
}

// 我的格币（余额 / 累计 / 等级 / 今日任务）
export interface DailyTask {
  key: string;
  label: string;
  amount: number;
  done: boolean;
}
export interface CoinInfo {
  balance: number;
  earnedTotal: number;
  level: number;
  tasks?: DailyTask[];
}

export interface Post {
  id: number;
  discussion_id: number;
  number: number;
  created_at: string;
  user_id: number;
  content: string;
  edited_at: string | null;
  is_private: number;
  reply_to_post_id: number | null;
  image_url: string | null;
  // 联表字段
  author?: string;
  author_gender?: Gender;
  author_avatar?: string | null;
  // 角色卡（发帖可选"以角色身份"）
  character_id?: number | null;
  character_name?: string | null;
  /** 作者已获徽章（"icon:tier" 逗号分隔，tier=1 为进阶徽章带特效），帖子作者名旁展示 */
  author_badges?: string | null;
  // 一键三连：点赞/收藏/投币计数 + 当前用户状态（后端联表返回）
  like_count?: number;
  favorite_count?: number;
  coin_count?: number;
  liked?: number | null;
  favorited?: number | null;
  /** 作者累计获得的格币（等级徽章依据，Lv.2 起显示） */
  author_earned?: number | null;
  /** 被滴滴次数 / 当前用户是否滴滴过（详情接口返回） */
  didi_count?: number;
  didi_by_me?: number;
}

export interface DiscussionDetail {
  discussion: Discussion;
  posts: Post[];
  tags: Tag[];
  /** 帖子总数（分页元信息：当前页条数 + 总数，前端据此判断加载更多/显示总楼层） */
  totalPosts?: number;
  /** 当前返回的是第几页 */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 私密主题：当前用户是否为收件人（被滴滴方）。仅收件人可看到"接受/婉拒"响应条 */
  isRecipient?: boolean;
  /** 私密主题（滴滴）：被滴滴的原帖信息（定位原帖用） */
  originPost?: {
    postId: number;
    discussionId: number;
    discussionTitle?: string | null;
    author?: string | null;
    excerpt?: string | null;
  } | null;
}

export type NotifType = 'didi' | 'reply' | 'report' | 'report_result' | 'invite' | 'coin';

export interface NotificationItem {
  id: number;
  user_id: number;
  actor_id: number | null;
  type: NotifType;
  discussion_id: number | null;
  post_id: number | null;
  content: string | null;
  is_read: number;
  created_at: string;
  /** 触发者用户名（后端返回字段；前端旧字段名 actor_name 兼容保留） */
  actor?: string | null;
  actor_name?: string;
  /** 全沉浸：触发者所用角色（若有）——通知显示角色身份而非皮下 */
  actor_character_name?: string | null;
  actor_character_appearance?: string | null;
  actor_character_gender?: string | null;
  /** 后端算好的跳转目标（接戏/滴滴→主题；标签申请→管理批准页；举报→管理举报页） */
  url?: string | null;
  /** 主题上下文（通知点入乐观渲染用）：标题/作者/头像/私密/评论数/标签 + 首帖摘要与配图 */
  discussion_title?: string | null;
  discussion_author?: string | null;
  discussion_author_avatar?: string | null;
  discussion_is_private?: number;
  discussion_comment_count?: number;
  discussion_excerpt?: string | null;
  discussion_image_url?: string | null;
  discussion_tags?: string | null;
  /** 被回复/被滴滴帖子的上下文（"回复了什么"） */
  target_excerpt?: string | null;
  /** 该帖楼层号（reply 通知 = 触发回复的楼层；乐观渲染直接显示这条回复用） */
  target_number?: number | null;
  target_author?: string | null;
  /** 触发回复所回复的楼层（回复链上下文：乐观渲染显示"被回复的那楼"） */
  target_reply_to_number?: number | null;
  target_reply_to_excerpt?: string | null;
  target_reply_to_author?: string | null;
}

export interface NotifListResult {
  data: NotificationItem[];
  meta: { unread: number; page?: number; hasMore?: boolean };
}

export interface PasskeyInfo {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface SecurityInfo {
  hasPassword: boolean;
  passkeyCount: number;
  passkeys: PasskeyInfo[];
}

export interface DiscussionListResult {
  data: Discussion[];
  meta: { hasMore: boolean; total?: number };
}

export interface PrivateItem {
  id: number;
  title: string;
  comment_count: number;
  created_at: string;
  last_posted_at: string | null;
  user_id: number;
  author?: string;
  author_gender?: Gender;
  author_avatar?: string | null;
  image_url?: string | null;
  // 滴滴响应状态：'accepted' | 'declined' | null（待回应）
  didi_status?: 'accepted' | 'declined' | null;
  // 三连相关（列表接口返回，列表卡片展示）
  first_post_id?: number | null;
  like_count?: number;
  favorite_count?: number;
  coin_count?: number;
  liked?: number | null;
  favorited?: number | null;
  author_earned?: number | null;
}

// 我的滴滴响应率（作为被滴滴方）
export interface DidiStats {
  total: number;
  accepted: number;
  declined: number;
  pending: number;
}

export interface MyTopicItem {
  id: number;
  title: string;
  comment_count: number;
  didi_count: number;
  created_at: string;
  last_posted_at: string | null;
  is_private: number;
  user_id: number;
  image_url?: string | null;
  // 三连相关（列表接口返回，列表卡片展示）
  first_post_id?: number | null;
  like_count?: number;
  favorite_count?: number;
  coin_count?: number;
  liked?: number | null;
  favorited?: number | null;
  author_earned?: number | null;
}

export interface DeviceAuthRequest {
  id: string;
  requester_label: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  created_at: string;
}

export interface CharacterItem {
  id: number;
  name: string;
  gender: Gender | null;
  age: string | null;
  identity: string | null;
  note: string | null;
  appearance: string | null;
}

/** 徽章（badges 表）：tier 0=基础 1=进阶 */
export interface BadgeItem {
  code: string;
  name: string;
  description: string;
  icon: string;
  tier: number;
  sort: number;
}

/** 我的徽章数据（GET /api/me/badges） */
export interface MyBadgesResult {
  badges: BadgeItem[];
  earned: { code: string; earned_at: string }[];
  inviteCount: number;
}

export interface InitData {
  user: User | null;
  tags: Tag[];
  drafts: Record<string, unknown>;
  characters?: CharacterItem[];
  discussions: Discussion[];
  hasMore: boolean;
  unread: number;
  deviceAuthPending: number;
  // SSR 补充：实际使用的排序/标签/种子（前端据此构造 SWR key 命中内联数据）
  sort?: 'recommend' | 'latest' | 'hot';
  tag?: number | null;
  seed?: number;
  // 页面级内联数据
  topicId?: number;
  topicData?: DiscussionDetail | null;
  topicError?: string;
  privateList?: PrivateItem[];
  myDiscussions?: MyTopicItem[];
  adminData?: unknown;
}

// ===== 管理后台（基础；字段以后端返回为准，可宽松处理） =====
export interface AdminReport {
  id: number;
  reporter_id: number;
  target_type: 'discussion' | 'post';
  target_id: number;
  target_user_id: number;
  reason: string;
  status: 'pending' | 'rejected' | 'resolved';
  admin_id: number | null;
  admin_note: string | null;
  created_at: string;
  handled_at: string | null;
  // 联表
  reporter_name?: string;
  target_user_name?: string;
  target_title?: string;
  target_content?: string;
}

export interface AdminUser {
  id: number;
  username: string;
  is_admin: number;
  is_banned: number;
  created_at: string;
  last_seen_at: string | null;
  discussion_count: number;
  comment_count: number;
  // 后端 /admin/users 联表补充
  last_ip?: string | null;
}

export interface IpLogRow {
  id: number;
  ip: string;
  user_id: number | null;
  path: string;
  ua: string;
  created_at: string;
}

export interface AdminStats {
  users?: number;
  discussions?: number;
  posts?: number;
  reportsPending?: number;
  bannedIps?: number;
  [k: string]: unknown;
}
