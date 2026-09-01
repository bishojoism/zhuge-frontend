// ===== 顶部吸顶导航栏高度（sticky .nav）=====
// 楼层/元素跳转滚动时需要扣除，否则目标顶部被导航栏盖住。
// 动态测量而非写死：移动端媒体查询会改 .nav padding（桌面 ≈55px，移动 ≈43px），
// 写死 64px 在移动端会多留空隙。所有楼层跳转路径统一走这里。
const FALLBACK_NAV_H = 55; // 桌面实测高度

export function navHeight(): number {
  const nav = document.querySelector('.nav');
  const h = nav ? nav.getBoundingClientRect().height : 0;
  return h > 0 ? h : FALLBACK_NAV_H;
}

// 元素相对文档顶部的绝对 y：滚动到该位置后元素顶部正好在导航栏下方
export function docYBelowNav(el: HTMLElement): number {
  return Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - navHeight()));
}
