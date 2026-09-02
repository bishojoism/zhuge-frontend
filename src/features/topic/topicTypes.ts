// ===== 主题详情页公共类型与常量（TopicPage / PostCard / 弹窗 / 分页 hook 共享） =====
import type { Discussion, Post } from '../../types';

// 回复分页大小（与后端 getDiscussionData 默认一致；SSR 内联第一页也是这个大小）
// 统一 20/页：每帖详情 SQL 含 10 个子查询，20 条=200 次子查询，明显减负；
// 前端滚动触底自动加载下一页（预取缓存命中几乎零等待）
export const PAGE_SIZE = 20;

// 性别徽标（皮下拉选项用）
export const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', other: '其他', secret: '保密' };

// 详情接口的帖子带额外联表字段（后端返回，类型上补全）
export interface TopicPost extends Post {
  reply_to_author?: string | null;
  didi_count?: number;
  didi_by_me?: number;
}

// 详情接口的讨论带作者头像（类型上补全）
export interface TopicDiscussion extends Discussion {
  author_avatar?: string | null;
}

// 回复云草稿数据结构
export interface ReplyDraftData {
  content?: string;
  imageUrl?: string | null;
}

// 目标帖定位请求：按帖子 id（通知/定位原帖）或按楼层号（回到上次位置）
export type PendingTarget = { id: number } | { number: number };
